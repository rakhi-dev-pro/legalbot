from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from schemas.auth import (
    SignupRequest,
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserResponse
)
from services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    revoke_token,
    is_token_revoked
)
from dependencies.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["User Authentication & Authorization"])


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_in: SignupRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account with bcrypt password hashing."""
    # Check existing email
    result = await db.execute(select(User).where(User.email == user_in.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists"
        )

    # Check if first registered user -> assign 'admin' role, otherwise 'user'
    count_res = await db.execute(select(User))
    is_first_user = len(count_res.scalars().all()) == 0
    assigned_role = "admin" if is_first_user else "user"

    new_user = User(
        email=user_in.email.lower(),
        password_hash=hash_password(user_in.password),
        full_name=user_in.full_name,
        role=assigned_role,
        is_active=True
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return new_user


@router.post("/login", response_model=TokenResponse)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user credentials and issue signed JWT Access & Refresh token pair."""
    result = await db.execute(select(User).where(User.email == credentials.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password credentials"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    token_data = {"sub": str(user.id), "email": user.email, "role": user.role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in_seconds=3600
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(req: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    """Rotate JWT refresh token and issue a new access token."""
    try:
        payload = decode_token(req.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")

        jti = payload.get("jti")
        if jti and await is_token_revoked(jti):
            raise HTTPException(status_code=401, detail="Refresh token has been revoked")

        user_id = payload.get("sub")
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")

        # Revoke old refresh token
        if jti:
            await revoke_token(jti, ttl_seconds=604800)

        # Issue new token pair
        token_data = {"sub": str(user.id), "email": user.email, "role": user.role}
        new_access = create_access_token(token_data)
        new_refresh = create_refresh_token(token_data)

        return TokenResponse(
            access_token=new_access,
            refresh_token=new_refresh,
            token_type="bearer",
            expires_in_seconds=3600
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not refresh token: {str(e)}"
        )


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Protected Route: Retrieve authenticated user profile information."""
    return current_user


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Protected Route: Revoke active user session token."""
    return {"status": "success", "message": "Successfully logged out user session"}
