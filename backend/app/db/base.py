from app.db.database import Base  # noqa: F401
from app.models.resume import JobDescription, OptimizationHistory, Resume, ResumeVersion  # noqa: F401
from app.models.user import User  # noqa: F401

"""Import all SQLAlchemy models so metadata discovery sees every table."""
