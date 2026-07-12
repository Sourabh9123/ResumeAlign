from app.db.database import Base  # noqa: F401
from app.models.agent_memory import AgentMemory  # noqa: F401
from app.models.oauth import OAuthAccount  # noqa: F401
from app.models.resume import JobDescription, OptimizationHistory, Resume, ResumeVersion  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.email_tracking import SentEmail  # noqa: F401

"""Import all SQLAlchemy models so metadata discovery sees every table."""
