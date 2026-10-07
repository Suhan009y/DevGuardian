"""
Central configuration for DevGuardian's backend.

Kept deliberately simple (no pydantic-settings dependency) since this is a
solo MCA mini project, not a multi-environment production service.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:3b")

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./storage/devguardian.db")

UPLOAD_DIR: Path = BASE_DIR / os.getenv("UPLOAD_DIR", "./uploads")
STORAGE_DIR: Path = BASE_DIR / "storage"

# Safety limits — this MVP is scoped for small student projects, not large repos.
MAX_UPLOAD_SIZE_MB: int = 25
MAX_FILES_IN_ZIP: int = 500

# Recognized languages and the file extensions used to detect them.
LANGUAGE_EXTENSIONS = {
    "python": {".py"},
    "javascript": {".js", ".jsx", ".mjs", ".cjs"},
    "typescript": {".ts", ".tsx"},
}

# Severity weights used by the quality score calculation.
SEVERITY_WEIGHTS = {
    "critical": 10,
    "high": 5,
    "medium": 2,
    "low": 1,
    "info": 0.5,
}

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
