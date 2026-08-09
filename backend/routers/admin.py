import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Document, AnalysisReport, RiskClause, RiskRulesConfig, DocumentStatus
from dependencies.auth import require_admin_role

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
    is_active: bool

    class Config:
        from_attributes = True


class RiskRuleUpdate(BaseModel):
    category: Optional[str] = None
    default_risk_level: Optional[str] = None
    confidence_threshold: Optional[float] = None
    weight: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class RiskRuleCreate(BaseModel):
    category: str
    default_risk_level: str = "Medium"
    confidence_threshold: float = 0.75
    weight: float = 1.0
    description: Optional[str] = None
    is_active: bool = True


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
