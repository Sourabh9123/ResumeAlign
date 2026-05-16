import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class Resume(Base):
    """Canonical resume record owned by a user."""

    __tablename__ = "resumes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    resume_url = Column(String)
    raw_text = Column(Text)
    structured_data = Column(JSONB)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    versions = relationship("ResumeVersion", back_populates="resume")


class ResumeVersion(Base):
    """Immutable snapshot of resume structured data at a point in time."""

    __tablename__ = "resume_versions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id"), nullable=False)
    structured_data = Column(JSONB)
    version_number = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    resume = relationship("Resume", back_populates="versions")


class JobDescription(Base):
    """Job description text and parsed keyword metadata for a user."""

    __tablename__ = "job_descriptions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String)
    company = Column(String)
    source_url = Column(String)
    raw_text = Column(Text)
    parsed_keywords = Column(JSONB)
    created_at = Column(DateTime, default=datetime.utcnow)


class OptimizationHistory(Base):
    """Audit record for a resume optimization run."""

    __tablename__ = "optimization_history"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id"))
    jd_id = Column(UUID(as_uuid=True), ForeignKey("job_descriptions.id"))
    ats_score_before = Column(Float)
    ats_score_after = Column(Float)
    generated_pdf_path = Column(String)
    generated_pdf_url = Column(String)
    generated_pdf_s3_key = Column(String)
    download_token = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
