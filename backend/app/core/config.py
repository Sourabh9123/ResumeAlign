from typing import Optional
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Resume Builder"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    DOCS_USERNAME: str = "admin"
    DOCS_PASSWORD: str = "admin"
    
    POSTGRES_SERVER: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "resume_builder"
    DATABASE_ECHO: bool = False
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 1800
    REDIS_URL: str
    
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    DEFAULT_AI_PROVIDER: str = "openai"
    OPENAI_MODEL: str = "gpt-4o-mini"
    ANTHROPIC_MODEL: str = "claude-3-haiku-20240307"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def DATABASE_URI(self) -> str:
        """Build the async PostgreSQL URL from individual database settings."""
        password = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{password}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

settings = Settings()
