from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.security import ALGORITHM
from app.models.user import User
from app.schemas.token import TokenPayload
from app.db.database import get_db
from sqlalchemy.future import select
from app.core.logging import logger

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

async def get_current_user(
    db: AsyncSession = Depends(get_db), token: str = Depends(reusable_oauth2)
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        if not token_data.sub:
            raise JWTError("Token subject is missing")
    except JWTError as exc:
        logger.warning(f"Token validation failed: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )

    try:
        result = await db.execute(select(User).where(User.id == token_data.sub))
        user = result.scalars().first()
        if not user:
            logger.warning(f"Authenticated token references missing user: {token_data.sub}")
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to load current user: {str(exc)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while validating user",
        )
