from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.api import api_router
from app.core.logging import logger
from app.db.database import engine, Base
from app.services.llm_factory import LLMProviderFactory
from pydantic import BaseModel

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up API and Initializing Database tables")
    async with engine.begin() as conn:
        # Create all tables for testing without alembic
        await conn.run_sync(Base.metadata.create_all)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

class PromptRequest(BaseModel):
    prompt: str

@app.post(f"{settings.API_V1_STR}/test-ai")
async def test_ai(request: PromptRequest):
    try:
        provider = LLMProviderFactory.create(settings.DEFAULT_AI_PROVIDER)
        response = await provider.generate(request.prompt)
        return {"provider": settings.DEFAULT_AI_PROVIDER, "response": response}
    except Exception as e:
        logger.error(f"Test AI failed: {e}", exc_info=True)
        return {"error": str(e)}
