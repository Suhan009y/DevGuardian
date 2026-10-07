"""
AI explanation layer — calls a locally-hosted Ollama model.

Design choices that matter for this project's story:
  - Every prompt is grounded in one specific static-analysis or dependency
    finding. The model is never asked to "review this codebase" freely —
    it explains and suggests a fix for exactly one already-detected issue.
  - Findings are explained ONE AT A TIME, sequentially. On a 4GB-VRAM laptop,
    running several LLM calls concurrently would thrash memory and likely
    crash Ollama; a simple loop is the safer, more predictable choice here.
  - The model is asked to reply in strict JSON so the explanation and the
    suggested fix can be stored as separate fields. If parsing fails, the
    raw text is stored as the explanation and the fix is left blank rather
    than the whole request failing.
"""
import json

import httpx

from app.config import OLLAMA_URL, OLLAMA_MODEL

REQUEST_TIMEOUT_SECONDS = 60.0

PROMPT_TEMPLATE = """You are a concise code review assistant. Explain the following \
static-analysis finding to a student developer, in plain English, and suggest a fix.

Tool: {tool}
Severity: {severity}
File: {file} (line {line})
Rule: {rule_id}
Message: {message}

Respond with ONLY a JSON object, no other text, in exactly this shape:
{{"explanation": "1-3 sentences on why this matters", "suggested_fix": "concrete fix, 1-4 sentences"}}
"""


class AIExplainError(Exception):
    pass


def _call_ollama(prompt: str) -> str:
    try:
        response = httpx.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.ConnectError:
        raise AIExplainError(
            f"Could not reach Ollama at {OLLAMA_URL}. Is `ollama serve` running?"
        )
    except httpx.HTTPStatusError as e:
        raise AIExplainError(f"Ollama returned an error: {e.response.status_code}")
    except httpx.TimeoutException:
        raise AIExplainError(
            "Ollama took too long to respond. Try a smaller model if this keeps happening."
        )

    return response.json().get("response", "")


def explain_finding(finding: dict) -> dict:
    """
    finding: dict with tool, severity, file, line, rule_id, message.
    Returns {"explanation": str, "suggested_fix": str}.
    """
    prompt = PROMPT_TEMPLATE.format(
        tool=finding.get("tool", "unknown"),
        severity=finding.get("severity", "unknown"),
        file=finding.get("file") or "unknown",
        line=finding.get("line") or "?",
        rule_id=finding.get("rule_id") or "n/a",
        message=finding.get("message", ""),
    )

    raw = _call_ollama(prompt)

    try:
        parsed = json.loads(raw)
        return {
            "explanation": parsed.get("explanation", "").strip() or "No explanation returned.",
            "suggested_fix": parsed.get("suggested_fix", "").strip(),
        }
    except json.JSONDecodeError:
        # Model didn't follow the JSON instruction — fall back to storing the
        # raw text as the explanation rather than losing the response.
        return {"explanation": raw.strip() or "No explanation returned.", "suggested_fix": ""}


def explain_findings(findings: list[dict]) -> list[dict]:
    """Sequentially explains a list of findings, returning explanation dicts in the same order."""
    return [explain_finding(f) for f in findings]
