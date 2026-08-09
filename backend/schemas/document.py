import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class DocumentResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    original_filename: str
    file_type: str
    file_size_bytes: int
    file_hash_sha256: str
    status: str
    error_message: Optional[str] = None
    uploaded_at: datetime

    class Config:
        from_attributes = True

class DocumentDetailResponse(DocumentResponse):
    storage_path: str
