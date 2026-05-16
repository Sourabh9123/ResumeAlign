from fastapi import Depends, HTTPException, status
from fastapi import Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.user import User
from app.db.database import get_db
from app.core.logging import logger
from app.services.auth import AuthService
from app.services.rate_limiter import RateLimitPolicy, rate_limiter

"""Reusable FastAPI dependencies for authentication and service wiring."""

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)


def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    """Build an authentication service for the current request.

    The service receives the request-scoped database session so auth workflows
    can query users, create accounts, and validate bearer tokens without route
    handlers knowing about persistence details.
    """
    return AuthService(db)


async def get_current_user(
    auth_service: AuthService = Depends(get_auth_service),
    token: str = Depends(reusable_oauth2),
) -> User:
    """Resolve the authenticated user from a bearer access token.

    FastAPI uses this dependency for protected routes. The token is decoded and
    the matching user is loaded through `AuthService`; invalid tokens become
    `403` responses and unexpected lookup failures become `500` responses.
    """
    try:
        return await auth_service.get_user_from_token(token)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to load current user: {str(exc)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while validating user",
        )


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Return the current user only when the account is active."""
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    return current_user


async def enforce_llm_rate_limit(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Apply the strict rate limit used by LLM and PDF generation endpoints."""
    await rate_limiter.check(
        RateLimitPolicy(
            name="llm",
            requests=settings.RATE_LIMIT_LLM_REQUESTS,
            window_seconds=settings.RATE_LIMIT_LLM_WINDOW_SECONDS,
        ),
        request,
        current_user,
    )
    return current_user


async def enforce_general_rate_limit(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Apply a broader authenticated-user rate limit for lighter API endpoints."""
    await rate_limiter.check(
        RateLimitPolicy(
            name="general",
            requests=settings.RATE_LIMIT_GENERAL_REQUESTS,
            window_seconds=settings.RATE_LIMIT_GENERAL_WINDOW_SECONDS,
        ),
        request,
        current_user,
    )
    return current_user


async def enforce_auth_rate_limit(request: Request) -> None:
    """Apply an IP-based rate limit for unauthenticated auth endpoints."""
    await rate_limiter.check(
        RateLimitPolicy(
            name="auth",
            requests=settings.RATE_LIMIT_AUTH_REQUESTS,
            window_seconds=settings.RATE_LIMIT_AUTH_WINDOW_SECONDS,
        ),
        request,
    )
