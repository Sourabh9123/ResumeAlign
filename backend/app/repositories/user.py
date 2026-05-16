from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    """Database access layer for users."""

    def __init__(self, db: AsyncSession):
        """Create a repository bound to the current database session."""
        self.db = db

    async def get_by_email(self, email: str) -> User | None:
        """Return a user by email address, or `None` when not found."""
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalars().first()

    async def get_by_id(self, user_id: str | UUID) -> User | None:
        """Return a user by UUID, or `None` when not found."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalars().first()

    async def create(self, email: str, hashed_password: str) -> User:
        """Persist a new user and return the refreshed ORM object."""
        user = User(email=email, hashed_password=hashed_password)
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
