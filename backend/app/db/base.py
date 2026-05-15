from app.db.database import Base
from app.models.user import User
from app.models.resume import Resume, JobDescription, ResumeVersion, OptimizationHistory

"""Import all SQLAlchemy models so metadata discovery sees every table."""
