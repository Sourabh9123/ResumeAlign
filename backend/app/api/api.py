from fastapi import APIRouter

from app.api.endpoints import agent, auth, docs, resume, email_tracking

"""Top-level API router registration for versioned backend endpoints."""

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(resume.router, prefix="/resume", tags=["resume"])
api_router.include_router(agent.router, prefix="/agent", tags=["agent"])
api_router.include_router(email_tracking.router, prefix="/emails", tags=["emails"])
api_router.include_router(docs.router, prefix="/docs", tags=["docs"])
# api_router.include_router(jd.router, prefix="/jd", tags=["jd"])
