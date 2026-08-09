from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from dependencies.auth import get_current_user
from tests.test_all_services import run_all_system_tests

router = APIRouter(tags=["System Diagnostics & Tests"])

@router.get("/tests/all")
@router.get("/api/tests/all")
async def run_system_diagnostic_tests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Protected Security Route: Requires 'Authorization: Bearer <jwt_token>'.
    Execute comprehensive end-to-end integration diagnostic test suite across all services over HTTPS:
    - PostgreSQL 17 + pgvector (Tables, Extension, HNSW Vector Search Query)
    - Redis Cache (Ping, Read, Write, Delete)
    - llama.cpp Local LLM (Completion Query with IBM Granite GGUF Model)
    - React Frontend Web Server (HTTP 200 Accessibility)
    """
    return await run_all_system_tests(db)
