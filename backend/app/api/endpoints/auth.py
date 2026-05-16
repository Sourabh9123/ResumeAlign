from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from app.api.deps import enforce_auth_rate_limit, get_auth_service, get_current_active_user
from app.schemas.user import UserCreate, UserResponse
from app.schemas.token import Token
from app.models.user import User
from app.core.logging import logger
from app.services.auth import AuthService

"""Authentication endpoints for account registration, login, and session lookup."""

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def read_current_user(current_user: User = Depends(get_current_active_user)):
    """Return the currently authenticated user's public profile.

    Requires a valid bearer access token in the `Authorization` header. The
    response is intentionally limited to safe user fields defined by
    `UserResponse`; password hashes and other internal state are never exposed.
    """
    return current_user


@router.post("/register", response_model=UserResponse)
async def register(
    user_in: UserCreate,
    _: None = Depends(enforce_auth_rate_limit),
    auth_service: AuthService = Depends(get_auth_service),
):
    """Create a new user account.

    Accepts an email and plaintext password, hashes the password in the auth
    service, stores the new user, and returns the created user's public profile.
    If the email is already registered the endpoint returns a `400` response.
    """
    try:
        return await auth_service.register_user(user_in)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error during registration: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during registration")


@router.post("/login", response_model=Token)
async def login(
    _: None = Depends(enforce_auth_rate_limit),
    form_data: OAuth2PasswordRequestForm = Depends(),
    auth_service: AuthService = Depends(get_auth_service),
):
    """Authenticate a user and issue a bearer access token.

    Uses OAuth2 password form fields: `username` contains the user's email and
    `password` contains the plaintext password. On success, returns an access
    token and token type suitable for `Authorization: Bearer <token>` headers.
    """
    try:
        return await auth_service.login(form_data.username, form_data.password)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error during login: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during login")
