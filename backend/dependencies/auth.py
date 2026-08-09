import uuid
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from services.auth_service import decode_token, is_token_revoked

# HTTP Bearer Authorization Scheme
security_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Mandatory FastAPI Security Dependency enforcing 'Authorization: Bearer <jwt_token>' header.
    Validates token signature, expiration, Redis revocation list, and active database user.
    """
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token expired",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
        user_id_str: Optional[str] = payload.get("sub")
        token_type: Optional[str] = payload.get("type")
        jti: Optional[str] = payload.get("jti")

        if not user_id_str or token_type != "access":
            raise credentials_exception

        # Check Redis revocation blacklist
        if jti and await is_token_revoked(jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been logged out or revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = uuid.UUID(user_id_str)
    except Exception:
        raise credentials_exception

    # Query active user from Database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    return user


async def require_admin_role(current_user: User = Depends(get_current_user)) -> User:
    """Role-guard dependency enforcing user.role == 'admin'."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required for this operation"
        )
    return current_user
