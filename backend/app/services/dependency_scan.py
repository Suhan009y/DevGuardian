"""
Dependency vulnerability scanning.

Best-effort: if a project has requirements.txt, run pip-audit; if it has
package.json, run npm audit. Either or both may be absent — that's not an
error, it just means there's nothing to scan for that ecosystem.
"""
import json
import subprocess
from pathlib import Path

TIMEOUT_SECONDS = 90


def _run_pip_audit(requirements_file: Path) -> list[dict]:
    try:
        result = subprocess.run(
            ["pip-audit", "-r", str(requirements_file), "-f", "json"],
            capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        )
    except FileNotFoundError:
        return [{
            "tool": "pip-audit", "category": "dependency", "severity": "info",
            "file": str(requirements_file.name), "line": None, "rule_id": None,
            "message": "pip-audit is not installed — dependency scan skipped. Run `pip install pip-audit`.",
        }]
    except subprocess.TimeoutExpired:
        return [{
            "tool": "pip-audit", "category": "dependency", "severity": "info",
            "file": str(requirements_file.name), "line": None, "rule_id": None,
            "message": "pip-audit timed out.",
        }]

    if not result.stdout.strip():
        return []

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []

    findings = []
    for dep in payload.get("dependencies", []):
        for vuln in dep.get("vulns", []):
            findings.append({
                "tool": "pip-audit",
                "category": "dependency",
                # pip-audit doesn't grade severity by default; treat every
                # reported CVE as "high" so it's not silently buried.
                "severity": "high",
                "file": str(requirements_file.name),
                "line": None,
                "rule_id": vuln.get("id"),
                "message": (
                    f"{dep.get('name')} {dep.get('version')} is affected by "
                    f"{vuln.get('id')}. Fix versions: {', '.join(vuln.get('fix_versions', []) or ['none published'])}."
                ),
            })
    return findings


def _run_npm_audit(project_root: Path) -> list[dict]:
    package_json = project_root / "package.json"
    if not package_json.exists():
        return []

    try:
        result = subprocess.run(
            ["npm", "audit", "--json"],
            capture_output=True, text=True, timeout=TIMEOUT_SECONDS, cwd=project_root,
        )
    except FileNotFoundError:
        return [{
            "tool": "npm-audit", "category": "dependency", "severity": "info",
            "file": "package.json", "line": None, "rule_id": None,
            "message": "npm is not installed — dependency scan skipped.",
        }]
    except subprocess.TimeoutExpired:
        return [{
            "tool": "npm-audit", "category": "dependency", "severity": "info",
            "file": "package.json", "line": None, "rule_id": None,
            "message": "npm audit timed out.",
        }]

    if not result.stdout.strip():
        return []

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []

    findings = []
    # npm's audit JSON shape differs between npm 6 and npm 7+; handle the
    # common npm 7+ "vulnerabilities" object shape.
    for name, info in payload.get("vulnerabilities", {}).items():
        severity = info.get("severity", "low")
        via = info.get("via", [])
        advisory_titles = [
            v.get("title", "") for v in via if isinstance(v, dict)
        ]
        findings.append({
            "tool": "npm-audit",
            "category": "dependency",
            "severity": severity if severity in {"critical", "high", "medium", "low"} else "low",
            "file": "package.json",
            "line": None,
            "rule_id": name,
            "message": (
                f"{name}: {'; '.join(t for t in advisory_titles if t) or 'vulnerability reported'}. "
                f"See `npm audit` for remediation details."
            ),
        })
    return findings


def run_dependency_scan(project_root: Path) -> list[dict]:
    findings: list[dict] = []

    requirements_file = project_root / "requirements.txt"
    if requirements_file.exists():
        findings.extend(_run_pip_audit(requirements_file))

    findings.extend(_run_npm_audit(project_root))

    return findings
