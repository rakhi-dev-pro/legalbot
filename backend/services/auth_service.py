import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import bcrypt
from jose import jwt, JWTError
import redis.asyncio as aioredis

from config import settings

def hash_password(password: str) -> str:
    """Hash plain-text password using bcrypt (work factor 12) with 72-byte max length handling."""
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt(12)
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against stored bcrypt hash."""
    try:
        pwd_bytes = plain_password.encode('utf-8')[:72]
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generate signed JWT Access Token (default 60 min expiry)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
        "jti": str(uuid.uuid4())
    })
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generate signed JWT Refresh Token (default 7 days expiry)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=7)
    )
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
        "jti": str(uuid.uuid4())
    })
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate JWT token signature and expiry."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid or expired JWT token: {str(e)}")


async def revoke_token(jti: str, ttl_seconds: int = 604800):
    """Store revoked JTI token in Redis blacklist."""
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.set(f"revoked_token:{jti}", "true", ex=ttl_seconds)
        await r.close()
    except Exception as e:
        print(f"Warning: Failed to blacklist token in Redis: {e}")


async def is_token_revoked(jti: str) -> bool:
    """Check if JTI token is blacklisted in Redis."""
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        val = await r.get(f"revoked_token:{jti}")
        await r.close()
        return val is not None
    except Exception:
        return False
