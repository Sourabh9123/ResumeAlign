import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

from app.api.api import api_router
from app.core.config import settings
from app.core.logging import logger
from app.db.database import Base, engine
from app.services.llm_factory import LLMProviderFactory
from app.services.rate_limiter import RateLimitPolicy, rate_limiter

docs_security = HTTPBasic()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and clean up application-level resources.

    Database tables are created on startup for this development-oriented setup.
    In a production migration flow, this block should be replaced by Alembic
    migrations that run outside the web process.
    """
    try:
        logger.info("Starting up API and Initializing Database tables")
        async with engine.begin() as conn:
            # Create all tables for testing without alembic
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables initialized successfully")
    except Exception as exc:
        logger.error(f"Database initialization failed: {str(exc)}", exc_info=True)
        raise RuntimeError("Failed to initialize database") from exc

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


def verify_docs_credentials(
    credentials: HTTPBasicCredentials = Depends(docs_security),
) -> str:
    """Validate credentials before serving API documentation.

    Defaults are intentionally development-friendly (`admin` / `admin`) and can
    be overridden with `DOCS_USERNAME` and `DOCS_PASSWORD` environment variables.
    """
    valid_username = secrets.compare_digest(credentials.username, settings.DOCS_USERNAME)
    valid_password = secrets.compare_digest(credentials.password, settings.DOCS_PASSWORD)
    if not (valid_username and valid_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid documentation credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


@app.get("/docs", include_in_schema=False)
async def protected_swagger_ui(username: str = Depends(verify_docs_credentials)):
    """Serve the Swagger UI page after documentation authentication.

    This route replaces FastAPI's default `/docs` route so the documentation UI
    is not publicly reachable. Users must provide the configured docs username
    and password via HTTP Basic authentication.
    """
    logger.info(f"API documentation accessed by {username}")
    return get_swagger_ui_html(
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        title=f"{settings.PROJECT_NAME} - API Docs",
    )


@app.get(f"{settings.API_V1_STR}/openapi.json", include_in_schema=False)
async def protected_openapi_schema(username: str = Depends(verify_docs_credentials)):
    """Serve the OpenAPI JSON schema after documentation authentication."""
    logger.info(f"OpenAPI schema accessed by {username}")
    return get_openapi(
        title=settings.PROJECT_NAME,
        version="1.0.0",
        routes=app.routes,
    )


@app.get("/health")
async def health_check():
    """Return a lightweight health response for uptime checks."""
    return {"status": "ok"}


class PromptRequest(BaseModel):
    """Request body for testing the configured AI provider."""

    prompt: str


@app.post(f"{settings.API_V1_STR}/test-ai")
async def test_ai(request: Request, prompt_request: PromptRequest):
    """Generate a test response from the configured AI provider.

    This utility endpoint is meant for development verification of API keys,
    model configuration, and provider connectivity. It returns a `400` response
    for provider configuration problems and `502` for upstream provider errors.
    """
    await rate_limiter.check(
        RateLimitPolicy(
            name="llm-test",
            requests=settings.RATE_LIMIT_LLM_REQUESTS,
            window_seconds=settings.RATE_LIMIT_LLM_WINDOW_SECONDS,
        ),
        request,
    )
    try:
        provider = LLMProviderFactory.create(settings.DEFAULT_AI_PROVIDER)
        response = await provider.generate(prompt_request.prompt)
        return {"provider": settings.DEFAULT_AI_PROVIDER, "response": response}
    except ValueError as exc:
        logger.warning(f"Test AI configuration failed: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error(f"Test AI failed: {str(exc)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider request failed",
        )
