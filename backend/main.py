import time
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import init_db, get_db
from routers.auth import router as auth_router
from routers.documents import router as documents_router
from routers.reports import router as reports_router
from routers.tests import router as tests_router
from routers.admin import router as admin_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("🚀 Initializing LegalBot Database, Vector extensions & Security Layer...")
    try:
        await init_db()
        print("✅ Database tables, pgvector HNSW indexes & Security Layer verified.")
    except Exception as e:
        print(f"⚠️ Warning: Could not auto-initialize DB on startup: {e}")

    # Startup recovery: Reset any documents stranded in 'processing' across server restart/crash
    try:
        from database import AsyncSessionLocal
        from models import Document, DocumentStatus
        from sqlalchemy import update
        async with AsyncSessionLocal() as session:
            stuck_res = await session.execute(
                update(Document)
                .where(Document.status == DocumentStatus.PROCESSING)
                .values(
                    status=DocumentStatus.FAILED,
                    error_message="Analysis interrupted by backend service restart. Please re-run or use Force Re-analyze."
                )
            )
            await session.commit()
            if stuck_res.rowcount > 0:
                print(f"🔄 Recovered {stuck_res.rowcount} orphaned processing document(s).")
    except Exception as e:
        print(f"⚠️ Warning: Could not auto-recover stuck documents on startup: {e}")

    if settings.SECRET_KEY == "super_secret_legalbot_jwt_key":
        print("🔒 Security Notice: Using default development SECRET_KEY. Configure custom SECRET_KEY for production.")

    yield

    # Shutdown logic
    print("👋 Shutting down LegalBot Backend...")
    try:
        from services.redis_service import close_redis_pool
        await close_redis_pool()
    except Exception:
        pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="LegalBot AI Processing API - Secure HTTPS & JWT Bearer Token Protected",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS with explicit allowed origins (replaces insecure wildcard *)
allowed_origins = [orig.strip() for orig in settings.CORS_ORIGINS.split(",") if orig.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(reports_router)
app.include_router(tests_router)
app.include_router(admin_router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "security": "HTTPS + Mandatory JWT Bearer Token",
        "docs_url": "/docs"
    }

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}

@app.get("/api/status/db")
async def check_db_status(db: AsyncSession = Depends(get_db)):
    """Verify PostgreSQL connectivity, check pgvector, and query seeded rules."""
    try:
        result = await db.execute(text("SELECT version();"))
        db_version = result.scalar()
        
        # Check pgvector extension
        vector_res = await db.execute(
            text("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")
        )
        vector_row = vector_res.fetchone()
        
        # Query rules count
        rules_res = await db.execute(text("SELECT COUNT(*) FROM risk_rules_config;"))
        rules_count = rules_res.scalar()

        # Query tables list
        tables_res = await db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        """))
        tables = [r[0] for r in tables_res.fetchall()]

        return {
            "status": "connected",
            "database_version": db_version,
            "pgvector_enabled": vector_row is not None,
            "pgvector_version": vector_row[1] if vector_row else None,
            "tables_created": tables,
            "seeded_risk_rules_count": rules_count
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@app.get("/api/status/redis")
async def check_redis_status():
    """Verify Redis cache connectivity."""
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL)
        pong = await r.ping()
        await r.close()
        return {"status": "connected", "ping": pong}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/status/llm")
async def check_llm_status():
    """Verify local llama.cpp server connectivity."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.LLAMA_CPP_URL}/health")
            if resp.status_code == 200:
                return {
                    "status": "connected",
                    "llama_cpp_url": settings.LLAMA_CPP_URL,
                    "model_file": settings.LLM_MODEL_FILE,
                    "response": resp.json()
                }
            else:
                return {
                    "status": "warning",
                    "llama_cpp_url": settings.LLAMA_CPP_URL,
                    "http_status": resp.status_code,
                    "message": "llama.cpp server is reachable but returned non-200. Ensure GGUF model is present in /models."
                }
    except Exception as e:
        return {
            "status": "disconnected",
            "llama_cpp_url": settings.LLAMA_CPP_URL,
            "model_file": settings.LLM_MODEL_FILE,
            "message": f"Could not reach llama.cpp server: {str(e)}. Model file is configured as {settings.LLM_MODEL_FILE}."
        }

@app.get("/api/status/full")
async def full_system_status(db: AsyncSession = Depends(get_db)):
    """Aggregated status check for dev dashboard."""
    db_stat = await check_db_status(db)
    redis_stat = await check_redis_status()
    llm_stat = await check_llm_status()

    return {
        "timestamp": time.time(),
        "backend": {"status": "healthy"},
        "database": db_stat,
        "redis": redis_stat,
        "llm_service": llm_stat
    }
