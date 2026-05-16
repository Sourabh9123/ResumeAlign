from pydantic import BaseModel


class Token(BaseModel):
    """Bearer token response returned after successful login."""

    access_token: str
    token_type: str


class TokenPayload(BaseModel):
    """Decoded JWT payload fields used by authentication dependencies."""

    sub: str | None = None
