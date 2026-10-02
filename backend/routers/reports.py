import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db, AsyncSessionLocal
from models import User, Document, AnalysisReport
from schemas.report import AnalysisReportResponse
from dependencies.auth import get_current_user
from services.nlp_pipeline import process_document_ai_analysis

router = APIRouter(prefix="/reports", tags=["AI Risk Reports & Analysis"])


@router.post("/analyze/{doc_id}", status_code=status.HTTP_202_ACCEPTED)
async def trigger_document_analysis(
    doc_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger Asynchronous AI Document Analysis Pipeline (Requires Bearer JWT Token):
    - Validates document ownership and status.
    - Dispatches 7-stage NLP analysis engine as a background task.
    - Supports force=True to restart an analysis if previous execution was interrupted.
    - Returns HTTP 202 Accepted with document status tracking.
    """
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if doc.status == "processing" and not force:
        return {
            "status": "processing",
            "message": "AI Document Analysis is currently in progress. Pass ?force=true to restart if stuck.",
            "document_id": str(doc_id)
        }

    # Dispatch background task using factory session
    background_tasks.add_task(process_document_ai_analysis, doc_id, AsyncSessionLocal)

    return {
        "status": "accepted",
        "message": "AI Analysis pipeline dispatched in background.",
        "document_id": str(doc_id)
    }


@router.get("/doc/{doc_id}", response_model=AnalysisReportResponse)
async def get_report_by_document_id(
    doc_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve structured analysis report for a specific document ID."""
    # Verify document ownership
    doc_res = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == current_user.id)
    )
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    result = await db.execute(
        select(AnalysisReport)
        .options(selectinload(AnalysisReport.risk_clauses))
        .where(AnalysisReport.document_id == doc_id)
        .order_by(AnalysisReport.completed_at.desc())
    )
    report = result.scalars().first()

    if not report:
        if doc.status in ("pending", "processing"):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content={
                    "status": doc.status,
                    "message": "Document AI analysis is currently processing.",
                    "document_id": str(doc_id)
                }
            )
        elif doc.status == "failed":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Document analysis failed: {doc.error_message}"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Analysis report not found. Trigger analysis via POST /reports/analyze/{doc_id} first."
            )

    return report


@router.get("/{report_id}", response_model=AnalysisReportResponse)
async def get_report_by_report_id(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve structured analysis report by report ID."""
    result = await db.execute(
        select(AnalysisReport)
        .options(selectinload(AnalysisReport.risk_clauses))
        .where(AnalysisReport.id == report_id)
    )
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Check document ownership
    doc_res = await db.execute(
        select(Document).where(Document.id == report.document_id, Document.user_id == current_user.id)
    )
    if not doc_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this report")

    return report
