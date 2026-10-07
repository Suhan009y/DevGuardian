"""
Lightweight language detection.

Deliberately simple: count files by extension and pick the dominant
recognized language. A full language classifier is out of scope for this
MVP — extension-based detection is accurate enough for single-language
student projects, which is what this version targets.
"""
from collections import Counter
from pathlib import Path

from app.config import LANGUAGE_EXTENSIONS

IGNORED_DIRS = {
    "node_modules", "venv", ".venv", "__pycache__", ".git",
    "dist", "build", ".mypy_cache", ".pytest_cache",
}


def detect_language(project_root: Path) -> tuple[str, dict]:
    """
    Returns (dominant_language, extension_counts).
    dominant_language is "unknown" if no recognized source files are found.
    """
    ext_to_lang = {
        ext: lang for lang, exts in LANGUAGE_EXTENSIONS.items() for ext in exts
    }
    counts = Counter()

    for path in project_root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        lang = ext_to_lang.get(path.suffix.lower())
        if lang:
            counts[lang] += 1

    if not counts:
        return "unknown", {}

    # TypeScript and JavaScript projects commonly mix both extensions;
    # treat them as one "javascript" bucket for the dominant-language decision
    # while still reporting the raw counts.
    merged = Counter(counts)
    if "typescript" in merged and "javascript" in merged:
        merged["javascript"] += merged.pop("typescript")

    dominant = merged.most_common(1)[0][0]
    return dominant, dict(counts)
