from typing import Any, Dict, Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.security import OAuth2PasswordRequestForm
from app.api import deps
from app.core import security
from app.schemas.user import UserCreate, UserResponse
from app.schemas.token import Token
from app.db.database import get_db
from sqlalchemy.future import select
from app.models.user import User
from app.core.logging import logger
import uuid

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(User).where(User.email == user_in.email))
        user = result.scalars().first()
        if user:
            logger.warning(f"Registration failed: User {user_in.email} already exists")
            raise HTTPException(
                status_code=400,
                detail="The user with this email already exists in the system",
            )
        user = User(
            email=user_in.email,
            hashed_password=security.get_password_hash(user_in.password),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info(f"User {user_in.email} registered successfully")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during registration: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during registration")

@router.post("/login", response_model=Token)
async def login(db: AsyncSession = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    try:
        result = await db.execute(select(User).where(User.email == form_data.username))
        user = result.scalars().first()
        if not user or not security.verify_password(form_data.password, user.hashed_password):
            logger.warning(f"Failed login attempt for {form_data.username}")
            raise HTTPException(status_code=400, detail="Incorrect email or password")
        elif not user.is_active:
            logger.warning(f"Login attempt for inactive user {form_data.username}")
            raise HTTPException(status_code=400, detail="Inactive user")
        
        access_token = security.create_access_token(user.id)
        logger.info(f"User {form_data.username} logged in successfully")
        return {
            "access_token": access_token,
            "token_type": "bearer",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during login: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during login")
