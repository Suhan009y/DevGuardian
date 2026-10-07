"""
Static analysis via Semgrep.

Runs Semgrep as a subprocess (not a Python API — Semgrep's CLI is the
supported integration point) and parses its JSON output into plain dicts
that `normalize.py` can merge with dependency-scan results.

Note: `--config=auto` fetches rules from the Semgrep registry on first run
and needs internet access. If you're working offline, point SEMGREP_CONFIG
at a locally cached ruleset instead (see README).
"""
import json
import subprocess
from pathlib import Path

SEMGREP_CONFIG = "auto"
SEMGREP_TIMEOUT_SECONDS = 120

SEVERITY_MAP = {
    "ERROR": "high",
    "WARNING": "medium",
    "INFO": "low",
}


class StaticAnalysisError(Exception):
    pass


def run_semgrep(project_root: Path) -> list[dict]:
    """
    Runs Semgrep over project_root and returns a list of normalized finding
    dicts: {tool, category, severity, file, line, rule_id, message}.
    """
    try:
        result = subprocess.run(
            [
                "semgrep", "scan",
                "--config", SEMGREP_CONFIG,
                "--json",
                "--quiet",
                "--timeout", str(SEMGREP_TIMEOUT_SECONDS),
                str(project_root),
            ],
            capture_output=True,
            text=True,
            timeout=SEMGREP_TIMEOUT_SECONDS + 15,
        )
    except FileNotFoundError:
        raise StaticAnalysisError(
            "Semgrep is not installed or not on PATH. Run `pip install semgrep`."
        )
    except subprocess.TimeoutExpired:
        raise StaticAnalysisError("Semgrep timed out analyzing this project.")

    if not result.stdout:
        # Semgrep can exit non-zero on findings even when it worked correctly,
        # so only treat an empty stdout as a real failure.
        raise StaticAnalysisError(f"Semgrep produced no output. stderr: {result.stderr[:500]}")

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise StaticAnalysisError(f"Could not parse Semgrep JSON output: {e}")

    findings = []
    for item in payload.get("results", []):
        severity_raw = item.get("extra", {}).get("severity", "INFO")
        findings.append({
            "tool": "semgrep",
            "category": "security" if "security" in item.get("check_id", "").lower() else "bug",
            "severity": SEVERITY_MAP.get(severity_raw, "low"),
            "file": item.get("path"),
            "line": item.get("start", {}).get("line"),
            "rule_id": item.get("check_id"),
            "message": item.get("extra", {}).get("message", "").strip() or "No message provided.",
        })
    return findings
