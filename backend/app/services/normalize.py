"""
Merges Semgrep and dependency-scan output into one flat list of findings,
all sharing the same shape:

    {tool, category, severity, file, line, rule_id, message}

This is the single schema every downstream consumer (DB storage, dashboard,
AI explanation) relies on, so each scanner's output is normalized here
rather than special-cased throughout the rest of the app.
"""

REQUIRED_KEYS = {"tool", "category", "severity", "file", "line", "rule_id", "message"}
VALID_SEVERITIES = {"critical", "high", "medium", "low", "info"}


def normalize_findings(*finding_lists: list[dict]) -> list[dict]:
    normalized = []
    for findings in finding_lists:
        for f in findings:
            item = {key: f.get(key) for key in REQUIRED_KEYS}
            if item["severity"] not in VALID_SEVERITIES:
                item["severity"] = "low"
            if not item.get("message"):
                item["message"] = "No message provided."
            normalized.append(item)
    return normalized
