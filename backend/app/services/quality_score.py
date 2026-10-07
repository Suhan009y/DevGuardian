"""
Severity-weighted code quality score.

Intentionally simple for this MVP: start at 100 and subtract a weighted
penalty per finding, floored at 0. This is meant to give a quick, relative
signal on the dashboard, not a rigorously validated metric.
"""
from app.config import SEVERITY_WEIGHTS


def calculate_quality_score(findings: list[dict]) -> float:
    if not findings:
        return 100.0

    penalty = sum(SEVERITY_WEIGHTS.get(f["severity"], 1) for f in findings)
    score = max(0.0, 100.0 - penalty)
    return round(score, 1)
