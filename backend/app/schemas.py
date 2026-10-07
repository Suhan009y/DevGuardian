import datetime as dt
from typing import Optional

from pydantic import BaseModel, ConfigDict


class FindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tool: str
    category: str
    severity: str
    file: Optional[str] = None
    line: Optional[int] = None
    rule_id: Optional[str] = None
    message: str
    ai_explanation: Optional[str] = None
    ai_suggested_fix: Optional[str] = None


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    language: Optional[str] = None
    uploaded_at: dt.datetime
    quality_score: Optional[float] = None
    status: str
    finding_count: int = 0


class ProjectDetail(ProjectSummary):
    findings: list[FindingOut] = []


class DashboardSummary(BaseModel):
    quality_score: Optional[float]
    total_findings: int
    by_severity: dict[str, int]
    by_category: dict[str, int]
    by_tool: dict[str, int]
