import uuid
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Document, DocumentChunk
from schemas.document import DocumentResponse, DocumentDetailResponse
from dependencies.auth import get_current_user
from services.file_service import save_encrypted_file, compute_sha256, delete_encrypted_file

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
