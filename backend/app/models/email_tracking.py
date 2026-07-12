import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.db.database import Base

class SentEmail(Base):
    """Database model for tracking emails sent by the AI agent."""

    __tablename__ = "sent_emails"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(String, nullable=False, index=True)
    thread_id = Column(String, nullable=True, index=True)
    recipient = Column(String, nullable=False)
    subject = Column(String, nullable=True)
    body = Column(String, nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
