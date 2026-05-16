from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.logging import logger
from app.core.security import ALGORITHM
from app.models.user import User
from app.repositories.user import UserRepository
from app.schemas.token import TokenPayload
from app.schemas.user import UserCreate


class AuthService:
    """Application service for user authentication and identity lookup."""

    def __init__(self, db: AsyncSession):
        """Create the service with request-scoped persistence dependencies."""
        self.db = db
        self.users = UserRepository(db)

    async def register_user(self, user_in: UserCreate) -> User:
        """Register a new user after validating email uniqueness."""
        existing_user = await self.users.get_by_email(user_in.email)
        if existing_user:
            logger.warning(f"Registration failed: User {user_in.email} already exists")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The user with this email already exists in the system",
            )

        hashed_password = security.get_password_hash(user_in.password)
        user = await self.users.create(user_in.email, hashed_password)
        logger.info(f"User {user.email} registered successfully")
        return user

    async def authenticate_user(self, email: str, password: str) -> User:
        """Validate credentials and return the active user."""
        user = await self.users.get_by_email(email)
        if not user or not security.verify_password(password, user.hashed_password):
            logger.warning(f"Failed login attempt for {email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect email or password",
            )

        if not user.is_active:
            logger.warning(f"Login attempt for inactive user {email}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

        return user

    async def login(self, email: str, password: str) -> dict[str, str]:
        """Authenticate credentials and return a bearer token payload."""
        user = await self.authenticate_user(email, password)
        logger.info(f"User {email} logged in successfully")
        return {
            "access_token": security.create_access_token(user.id),
            "token_type": "bearer",
        }

    async def get_user_from_token(self, token: str) -> User:
        """Decode an access token and load the referenced user."""
        token_data = self.decode_token(token)
        if token_data.sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")
        user = await self.users.get_by_id(token_data.sub)
        if not user:
            logger.warning(f"Authenticated token references missing user: {token_data.sub}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    @staticmethod
    def decode_token(token: str) -> TokenPayload:
        """Decode and validate a JWT access token payload."""
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            token_data = TokenPayload(**payload)
            if not token_data.sub:
                raise JWTError("Token subject is missing")
            return token_data
        except JWTError as exc:
            logger.warning(f"Token validation failed: {str(exc)}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
