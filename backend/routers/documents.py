import uuid
import json
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from config import settings
from database import get_db
from models import User, Document, DocumentChunk, AnalysisReport, RiskClause
from schemas.document import DocumentResponse, DocumentDetailResponse
from dependencies.auth import get_current_user
from services.file_service import save_encrypted_file, compute_sha256, delete_encrypted_file, read_decrypted_file
from services.pdf_highlighter import extract_pdf_highlights, generate_annotated_pdf

router = APIRouter(prefix="/docs", tags=["Document Management & Ingestion"])

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc"}
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB Limit


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_legal_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Secure Document Upload Endpoint (Requires Bearer JWT Token):
    - Validates file extension (PDF or DOCX) & size (max 25 MB).
    - Encrypts file at rest with AES-256 before disk storage.
    - Computes SHA-256 hash for audit deduplication.
    - Saves document record linked to authenticated user.
    """
    # 1. Validate File Extension
    filename = file.filename or "uploaded_contract.pdf"
    file_ext = filename.split(".")[-1].lower() if "." in filename else ""
    
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format: '.{file_ext}'. Only PDF (.pdf) and DOCX (.docx) files are supported."
        )

    # 2. Read File Bytes & Validate Size
    file_bytes = await file.read()
    file_size = len(file_bytes)
    
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed limit of 25 MB ({round(file_size/(1024*1024), 2)} MB provided)."
        )

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes)."
        )

    # 3. Compute SHA-256 Hash & Encrypt at Rest
    file_hash = compute_sha256(file_bytes)
    encrypted_path = save_encrypted_file(file_bytes, filename)

    # 4. Create Document Record in PostgreSQL
    new_doc = Document(
        user_id=current_user.id,
        original_filename=filename,
        file_type=file_ext.upper(),
        file_size_bytes=file_size,
        file_hash_sha256=file_hash,
        storage_path=encrypted_path,
        status="pending"
    )

    db.add(new_doc)
    await db.commit()
    await db.refresh(new_doc)

    return new_doc


@router.get("/", response_model=List[DocumentResponse])
async def list_user_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all uploaded documents for the currently authenticated user."""
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.uploaded_at.desc())
    )
    return result.scalars().all()


@router.get("/{doc_id}", response_model=DocumentDetailResponse)
async def get_document_details(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve detailed document metadata by document ID."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


@router.get("/{doc_id}/chunks")
async def get_document_chunks(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve text chunks of a document for side-by-side document viewing."""
    # Verify ownership
    doc_res = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    if not doc_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == doc_id)
        .order_by(DocumentChunk.chunk_index.asc())
    )
    chunks = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "chunk_index": c.chunk_index,
            "chunk_text": c.chunk_text,
            "page_number": c.page_number
        }
        for c in chunks
    ]


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete document record and remove encrypted disk file."""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Delete encrypted disk file
    delete_encrypted_file(doc.storage_path)

    # Delete DB record
    await db.delete(doc)
    await db.commit()

    return {"status": "success", "message": f"Document {doc_id} deleted successfully"}


@router.get("/{doc_id}/pdf")
async def get_document_pdf(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Stream decrypted PDF bytes for direct rendering in React with pdfjs-dist.
    """
    doc_res = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if doc.file_type.upper() != "PDF":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document is not a PDF")

    try:
        file_bytes = read_decrypted_file(doc.storage_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to decrypt document: {e}")

    safe_filename = doc.original_filename or "contract.pdf"
    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_filename}"',
            "Cache-Control": "private, max-age=3600",
            "Content-Length": str(len(file_bytes))
        }
    )


@router.get("/{doc_id}/highlights")
async def get_document_highlights(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract exact bounding boxes and coordinates for all detected risk clauses
    using PyMuPDF (fitz) so React can render interactive, clickable highlights on the PDF.
    """
    doc_res = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    cache_key = f"pdf_highlights:{doc_id}"
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        cached_data = await r.get(cache_key)
        if cached_data:
            return json.loads(cached_data)
    except Exception:
        pass

    # Get analysis report and risk clauses
    report_res = await db.execute(
        select(AnalysisReport).where(AnalysisReport.document_id == doc_id)
    )
    report = report_res.scalar_one_or_none()
    if not report:
        return []

    clauses_res = await db.execute(
        select(RiskClause).where(RiskClause.report_id == report.id)
    )
    clauses = clauses_res.scalars().all()
    clauses_data = [
        {
            "id": str(c.id),
            "clause_type": c.clause_type,
            "clause_text": c.clause_text,
            "explanation": c.explanation,
            "risk_level": c.risk_level,
            "confidence_score": c.confidence_score,
            "page_number": c.page_number,
            "recommendation": c.recommendation
        }
        for c in clauses
    ]

    try:
        file_bytes = read_decrypted_file(doc.storage_path)
        page_highlights = extract_pdf_highlights(file_bytes, clauses_data)

        # Store in Redis for instant subsequent retrieval
        try:
            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await r.set(cache_key, json.dumps(page_highlights), ex=86400 * 7)
        except Exception:
            pass

        return page_highlights
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate highlights: {e}")


@router.get("/{doc_id}/annotated-pdf")
async def get_annotated_pdf(
    doc_id: uuid.UUID,
    clause_ids: str = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate and stream an annotated PDF with native PyMuPDF highlights
    and risk description popups. Supports filtering by selected clause IDs.
    """
    doc_res = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    report_res = await db.execute(
        select(AnalysisReport).where(AnalysisReport.document_id == doc_id)
    )
    report = report_res.scalar_one_or_none()
    clauses_data = []
    if report:
        clauses_res = await db.execute(
            select(RiskClause).where(RiskClause.report_id == report.id)
        )
        clauses_data = [
            {
                "id": str(c.id),
                "clause_type": c.clause_type,
                "clause_text": c.clause_text,
                "explanation": c.explanation,
                "risk_level": c.risk_level,
                "page_number": c.page_number,
                "recommendation": c.recommendation
            }
            for c in clauses_res.scalars().all()
        ]

    selected_ids = [cid.strip() for cid in clause_ids.split(",") if cid.strip()] if clause_ids else None

    try:
        file_bytes = read_decrypted_file(doc.storage_path)
        annotated_bytes = generate_annotated_pdf(file_bytes, clauses_data, selected_clause_ids=selected_ids)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate annotated PDF: {e}")

    safe_name = f"annotated_{doc.original_filename or 'document.pdf'}"
    return Response(
        content=annotated_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "Cache-Control": "no-cache",
            "Content-Length": str(len(annotated_bytes))
        }
    )

