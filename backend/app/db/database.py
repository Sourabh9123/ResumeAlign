from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeMeta, declarative_base

from app.core.config import settings


def create_database_engine() -> AsyncEngine:
    """Create the async SQLAlchemy engine with production-friendly pooling.

    The pool settings are intentionally configurable through environment
    variables so local development, Docker, and deployment can use the same
    code while choosing different connection limits.
    """
    return create_async_engine(
        settings.DATABASE_URI,
        echo=settings.DATABASE_ECHO,
        pool_pre_ping=True,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_timeout=settings.DATABASE_POOL_TIMEOUT,
        pool_recycle=settings.DATABASE_POOL_RECYCLE,
    )


engine = create_database_engine()
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)
Base: DeclarativeMeta = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield one database session per request and rollback on failures.

    FastAPI runs the cleanup code after the endpoint finishes. If endpoint
    execution raises an exception, the pending transaction is rolled back so
    the connection returns to the pool in a clean state.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
