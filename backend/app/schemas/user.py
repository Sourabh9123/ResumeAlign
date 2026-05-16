from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    """Shared user fields exposed through API schemas."""

    email: EmailStr


class UserCreate(UserBase):
    """Request body for creating a user account."""

    password: str


class UserResponse(UserBase):
    """Public user representation returned by API endpoints."""

    id: UUID
    is_active: bool

    class Config:
        """Enable serialization from SQLAlchemy ORM model instances."""

        from_attributes = True
