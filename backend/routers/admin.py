import uuid
import json
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from config import settings
from database import get_db, AsyncSessionLocal
from models import User, Document, AnalysisReport, RiskClause, RiskRulesConfig, DocumentStatus
from dependencies.auth import require_admin_role
from services.nlp_pipeline import (
    process_document_ai_analysis,
    match_rule_to_chunk,
    compute_confidence_score,
    find_category_definition,
    extract_targeted_clause_snippet
)

logger = logging.getLogger("legalbot.admin")

router = APIRouter(prefix="/admin", tags=["Admin Panel"])


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class RiskRuleResponse(BaseModel):
    id: uuid.UUID
    category: str
    default_risk_level: str
    confidence_threshold: float
    weight: float
    description: Optional[str] = None
    keywords: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class RiskRuleUpdate(BaseModel):
    category: Optional[str] = None
    default_risk_level: Optional[str] = None
    confidence_threshold: Optional[float] = None
    weight: Optional[float] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    is_active: Optional[bool] = None


class RiskRuleCreate(BaseModel):
    category: str
    default_risk_level: str = "Medium"
    confidence_threshold: float = 0.75
    weight: float = 1.0
    description: Optional[str] = None
    keywords: Optional[str] = None
    is_active: bool = True


class AdminDocumentItem(BaseModel):
    id: uuid.UUID
    original_filename: str
    file_type: str
    file_size_bytes: int
    status: str
    user_id: uuid.UUID
    user_email: str
    overall_risk: Optional[str] = None
    composite_risk_score: Optional[float] = None
    total_risks_found: int = 0
    uploaded_at: str


class RuleMatchTestRequest(BaseModel):
    text: str
    custom_keywords: Optional[str] = None


class RuleMatchItem(BaseModel):
    category: str
    risk_level: str
    weight: float
    confidence_threshold: float
    evidence_type: str
    confidence_score: float
    passed_threshold: bool
    snippet: str


class UserSummary(BaseModel):
    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    document_count: int = 0
    created_at: str

    class Config:
        from_attributes = True


class RoleUpdate(BaseModel):
    role: str  # "admin" or "user"


class SystemStats(BaseModel):
    total_users: int
    active_users: int
    total_documents: int
    completed_analyses: int
    failed_analyses: int
    high_risk_documents: int
    medium_risk_documents: int
    low_risk_documents: int
    total_risk_clauses: int
    avg_processing_time_seconds: Optional[float] = None


# ---------------------------------------------------------------------------
# Risk Rules CRUD
# ---------------------------------------------------------------------------

@router.get("/rules", response_model=list[RiskRuleResponse])
async def list_risk_rules(
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """List all risk rules (active + inactive)."""
    result = await db.execute(
        select(RiskRulesConfig).order_by(RiskRulesConfig.category)
    )
    return result.scalars().all()


@router.post("/rules", response_model=RiskRuleResponse, status_code=201)
async def create_risk_rule(
    payload: RiskRuleCreate,
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Create a new custom risk rule."""
    # Check for duplicate category
    existing = await db.execute(
        select(RiskRulesConfig).where(RiskRulesConfig.category == payload.category)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Rule category '{payload.category}' already exists."
        )

    rule = RiskRulesConfig(
        category=payload.category,
        default_risk_level=payload.default_risk_level,
        confidence_threshold=payload.confidence_threshold,
        weight=payload.weight,
        description=payload.description,
        keywords=payload.keywords,
        is_active=payload.is_active
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=RiskRuleResponse)
async def update_risk_rule(
    rule_id: uuid.UUID,
    payload: RiskRuleUpdate,
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing risk rule."""
    result = await db.execute(
        select(RiskRulesConfig).where(RiskRulesConfig.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Risk rule not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
async def delete_risk_rule(
    rule_id: uuid.UUID,
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Delete a risk rule."""
    result = await db.execute(
        select(RiskRulesConfig).where(RiskRulesConfig.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Risk rule not found.")

    await db.delete(rule)
    await db.commit()
    return {"status": "deleted", "category": rule.category}


# ---------------------------------------------------------------------------
# User Management
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[UserSummary])
async def list_all_users(
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """List all registered users with document counts."""
    result = await db.execute(
        select(
            User,
            func.count(Document.id).label("doc_count")
        )
        .outerjoin(Document, Document.user_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )
    rows = result.all()
    users = []
    for user_obj, doc_count in rows:
        users.append(UserSummary(
            id=user_obj.id,
            email=user_obj.email,
            full_name=user_obj.full_name,
            role=user_obj.role,
            is_active=user_obj.is_active,
            document_count=doc_count,
            created_at=user_obj.created_at.isoformat()
        ))
    return users


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    payload: RoleUpdate,
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Change a user's role (admin / user)."""
    if payload.role not in ("admin", "user"):
        raise HTTPException(
            status_code=400,
            detail="Role must be 'admin' or 'user'."
        )

    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    target_user.role = payload.role
    await db.commit()
    return {"status": "updated", "user_id": str(user_id), "new_role": payload.role}


@router.put("/users/{user_id}/active")
async def toggle_user_active(
    user_id: uuid.UUID,
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Toggle user active/inactive status."""
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Prevent admin from deactivating themselves
    if target_user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account.")

    target_user.is_active = not target_user.is_active
    await db.commit()
    return {
        "status": "updated",
        "user_id": str(user_id),
        "is_active": target_user.is_active
    }


# ---------------------------------------------------------------------------
# System Analytics
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=SystemStats)
async def get_system_stats(
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """System-wide analytics dashboard data."""
    # Users
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )).scalar() or 0

    # Documents
    total_docs = (await db.execute(select(func.count(Document.id)))).scalar() or 0
    completed = (await db.execute(
        select(func.count(Document.id)).where(Document.status == DocumentStatus.COMPLETED)
    )).scalar() or 0
    failed = (await db.execute(
        select(func.count(Document.id)).where(Document.status == DocumentStatus.FAILED)
    )).scalar() or 0

    # Risk distribution
    high = (await db.execute(
        select(func.count(AnalysisReport.id)).where(AnalysisReport.overall_risk == "High")
    )).scalar() or 0
    medium = (await db.execute(
        select(func.count(AnalysisReport.id)).where(AnalysisReport.overall_risk == "Medium")
    )).scalar() or 0
    low = (await db.execute(
        select(func.count(AnalysisReport.id)).where(AnalysisReport.overall_risk == "Low")
    )).scalar() or 0

    # Risk clauses total
    total_clauses = (await db.execute(select(func.count(RiskClause.id)))).scalar() or 0

    # Average processing time
    avg_time = (await db.execute(
        select(func.avg(AnalysisReport.processing_time_seconds))
    )).scalar()

    return SystemStats(
        total_users=total_users,
        active_users=active_users,
        total_documents=total_docs,
        completed_analyses=completed,
        failed_analyses=failed,
        high_risk_documents=high,
        medium_risk_documents=medium,
        low_risk_documents=low,
        total_risk_clauses=total_clauses,
        avg_processing_time_seconds=round(avg_time, 2) if avg_time else None
    )


# ---------------------------------------------------------------------------
# Rule Matching Simulator / Tester
# ---------------------------------------------------------------------------

@router.post("/rules/test-match", response_model=List[RuleMatchItem])
async def test_rule_match_simulation(
    payload: RuleMatchTestRequest,
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Simulate rule matching against arbitrary contract text in real-time.
    Allows admins to verify custom keywords, thresholds, and regex patterns
    before applying them to actual documents.
    """
    rules_res = await db.execute(
        select(RiskRulesConfig).where(RiskRulesConfig.is_active == True)
    )
    active_rules = rules_res.scalars().all()

    matches: List[RuleMatchItem] = []
    chunk_text = payload.text

    for rule in active_rules:
        custom_kw = payload.custom_keywords if (payload.custom_keywords and rule.category.lower() in payload.custom_keywords.lower()) else rule.keywords
        is_match, evidence_type = match_rule_to_chunk(rule.category, chunk_text, custom_keywords=custom_kw)
        if not is_match:
            continue

        conf = compute_confidence_score(evidence_type, llm_confirmed=False)
        passed = conf >= rule.confidence_threshold

        defn = find_category_definition(rule.category)
        custom_kws = [k.strip().lower() for k in (custom_kw or "").split(",") if k.strip()]
        kw_list = ((defn["multi_word"] + defn["keywords"]) if defn else [rule.category]) + custom_kws
        pat = defn["primary_pattern"] if defn else None
        snippet = extract_targeted_clause_snippet(chunk_text, kw_list, pat)

        matches.append(RuleMatchItem(
            category=rule.category,
            risk_level=rule.default_risk_level,
            weight=rule.weight,
            confidence_threshold=rule.confidence_threshold,
            evidence_type=evidence_type,
            confidence_score=conf,
            passed_threshold=passed,
            snippet=snippet
        ))

    return matches


# ---------------------------------------------------------------------------
# Document Portfolio & Re-Analysis Controls
# ---------------------------------------------------------------------------

@router.get("/documents", response_model=List[AdminDocumentItem])
async def list_all_admin_documents(
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """List all documents across all users with their risk report status for admin control."""
    result = await db.execute(
        select(Document, User.email, AnalysisReport)
        .join(User, Document.user_id == User.id)
        .outerjoin(AnalysisReport, AnalysisReport.document_id == Document.id)
        .order_by(Document.uploaded_at.desc())
    )
    rows = result.all()
    doc_items = []
    for doc, email, report in rows:
        doc_items.append(AdminDocumentItem(
            id=doc.id,
            original_filename=doc.original_filename,
            file_type=doc.file_type,
            file_size_bytes=doc.file_size_bytes,
            status=doc.status,
            user_id=doc.user_id,
            user_email=email,
            overall_risk=report.overall_risk if report else None,
            composite_risk_score=report.composite_risk_score if report else None,
            total_risks_found=report.total_risks_found if report else 0,
            uploaded_at=doc.uploaded_at.isoformat() if doc.uploaded_at else ""
        ))
    return doc_items


@router.post("/documents/{doc_id}/reanalyze")
async def admin_reanalyze_document(
    doc_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Re-trigger AI analysis on a document using current dynamic risk rules and weights.
    Invalidates Redis highlight cache and queues fresh analysis.
    """
    doc_res = await db.execute(select(Document).where(Document.id == doc_id))
    document = doc_res.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Invalidate Redis highlight cache
    try:
        from services.redis_service import get_redis
        async with get_redis() as r:
            await r.delete(f"pdf_highlights:{doc_id}")
    except Exception as e:
        logger.warning(f"Could not clear Redis highlight cache for {doc_id}: {e}")

    document.status = DocumentStatus.PROCESSING
    await db.commit()

    background_tasks.add_task(process_document_ai_analysis, doc_id, AsyncSessionLocal)
    return {
        "status": "accepted",
        "message": f"Re-analysis dispatched for '{document.original_filename}'.",
        "document_id": str(doc_id)
    }


async def _process_documents_sequentially(doc_ids: List[uuid.UUID]):
    """Execute AI analysis for a list of documents sequentially to avoid LLM resource starvation."""
    for doc_id in doc_ids:
        try:
            await process_document_ai_analysis(doc_id, AsyncSessionLocal)
        except Exception as e:
            logger.error(f"Sequential batch analysis failed for doc {doc_id}: {e}")


@router.post("/documents/reanalyze-all")
async def admin_reanalyze_all_documents(
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Batch re-analyze all active documents sequentially to protect LLM queue.
    """
    docs_res = await db.execute(select(Document))
    documents = docs_res.scalars().all()
    if not documents:
        return {
            "status": "accepted",
            "queued_count": 0,
            "message": "No documents found to re-analyze."
        }

    doc_ids = [doc.id for doc in documents]

    try:
        from services.redis_service import get_redis
        async with get_redis() as r:
            for doc in documents:
                await r.delete(f"pdf_highlights:{doc.id}")
                doc.status = DocumentStatus.PENDING

        # Mark first document as processing, queue the batch worker
        documents[0].status = DocumentStatus.PROCESSING
        await db.commit()
    except Exception as e:
        logger.error(f"Error preparing reanalyze-all: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to queue re-analysis: {str(e)}")

    background_tasks.add_task(_process_documents_sequentially, doc_ids)

    return {
        "status": "accepted",
        "queued_count": len(doc_ids),
        "message": f"Queued {len(doc_ids)} documents for sequential background re-analysis."
    }
