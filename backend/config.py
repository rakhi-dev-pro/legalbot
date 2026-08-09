import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "LegalBot AI API"
    VERSION: str = "1.0.0"
    
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://legal_admin:legalbot_secure_pass_2026@postgres:5432/legalbot"
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    LLAMA_CPP_URL: str = os.getenv("LLAMA_CPP_URL", "http://llm-service:8080")
    LLM_MODEL_FILE: str = os.getenv("LLM_MODEL_FILE", "granite-4.1-3b-Q6_K.gguf")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super_secret_legalbot_jwt_key")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

settings = Settings()
