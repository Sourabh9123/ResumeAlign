from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


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


class ForgotPasswordRequest(BaseModel):
    """Request body to set a new password for an existing account by email."""

    email: EmailStr
    new_password: str = Field(min_length=6)
