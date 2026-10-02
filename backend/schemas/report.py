import uuid
from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel

class RiskClauseSchema(BaseModel):
    id: uuid.UUID
    clause_type: str
    clause_text: str
    explanation: str
    risk_level: str
    confidence_score: float
    page_number: Optional[int] = None
    recommendation: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AnalysisReportResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    executive_summary: str
    key_entities: Dict[str, Any]
    overall_risk: str
    composite_risk_score: Optional[float] = 0.0
    total_risks_found: int
    processing_time_seconds: Optional[float] = None
    model_used: str
    completed_at: datetime
    risk_clauses: List[RiskClauseSchema] = []

    class Config:
        from_attributes = True
