import datetime as dt

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Text
)
from sqlalchemy.orm import relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    language = Column(String, nullable=True)          # dominant detected language
    uploaded_at = Column(DateTime, default=dt.datetime.utcnow)
    quality_score = Column(Float, nullable=True)       # 0-100, set after analysis
    status = Column(String, default="uploaded")        # uploaded -> analyzed -> explained

    findings = relationship(
        "Finding", back_populates="project", cascade="all, delete-orphan"
    )


class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)

    tool = Column(String, nullable=False)        # "semgrep" | "pip-audit" | "npm-audit"
    category = Column(String, nullable=False)    # "security" | "bug" | "dependency" | "style"
    severity = Column(String, nullable=False)    # "critical" | "high" | "medium" | "low" | "info"
    file = Column(String, nullable=True)
    line = Column(Integer, nullable=True)
    rule_id = Column(String, nullable=True)
    message = Column(Text, nullable=False)

    ai_explanation = Column(Text, nullable=True)
    ai_suggested_fix = Column(Text, nullable=True)

    project = relationship("Project", back_populates="findings")
