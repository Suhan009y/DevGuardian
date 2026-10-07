# DevGuardian — Level 1 MVP

AI-assisted code review platform. This is the **initial version** implementing the
always-on Level 1 pipeline only:

```
Upload ZIP → Extract → Detect language → Static analysis (Semgrep)
   → Dependency scanning (pip-audit / npm audit) → Normalize into a report
   → AI explanation (Ollama, local) → Dashboard
```

Code from the uploaded project is **never executed**. The optional Level 2 stage
(AI-generated tests run inside a sandboxed Docker container) is intentionally
not part of this version — see "What's not here yet" below.

## Why it's built this way

This is scoped for a solo MCA mini-project running on modest hardware
(8GB RAM / 4GB VRAM class laptop):
- No React build step — the frontend is plain HTML/JS + Chart.js via CDN, so
  there's nothing to compile and it runs by just opening files served by the backend.
- SQLite instead of PostgreSQL — zero setup, single file, plenty for a small
  number of uploaded projects.
- AI explanations run **one finding at a time** against a local Ollama model,
  not in parallel — parallel calls would exhaust 4GB of VRAM quickly.
- Everything runs locally; no API key, no per-request cost, no code leaves the machine.

## Prerequisites

Install these on your machine before running the backend:

1. **Python 3.10+**
2. **Semgrep** — `pip install semgrep`
3. **pip-audit** — `pip install pip-audit`
4. **Node.js + npm** (optional, only needed if you want to scan JS/TS projects'
   dependencies with `npm audit`)
5. **Ollama** — install from https://ollama.com, then pull a small model that
   fits in 4GB VRAM:
   ```
   ollama pull qwen2.5-coder:3b
   ```
   (If `qwen2.5-coder:3b` is too slow on your machine, try `qwen2.5-coder:1.5b`.)

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and adjust if needed (model name, Ollama URL).

## Run

```bash
# Make sure Ollama is running in the background first:
ollama serve

# Then, from backend/:
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser — the backend also serves the
frontend directly, so no separate frontend server is needed.

## Project layout

```
DevGuardian/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, mounts frontend, includes routers
│   │   ├── config.py             # Settings (Ollama URL/model, paths)
│   │   ├── database.py           # SQLite engine/session setup
│   │   ├── models.py             # SQLAlchemy models: Project, Finding
│   │   ├── schemas.py            # Pydantic response schemas
│   │   ├── services/
│   │   │   ├── extract.py            # Safe ZIP extraction (zip-slip protected)
│   │   │   ├── detect_language.py    # Extension-based language detection
│   │   │   ├── static_analysis.py    # Semgrep wrapper
│   │   │   ├── dependency_scan.py    # pip-audit / npm audit wrapper
│   │   │   ├── normalize.py          # Merge tool outputs into one schema
│   │   │   ├── quality_score.py      # Severity-weighted quality score
│   │   │   └── ai_explain.py         # Ollama calls, one finding at a time
│   │   └── routers/
│   │       └── projects.py       # /api/projects/* endpoints
│   ├── requirements.txt
│   └── uploads/, storage/        # Runtime data (gitignored)
└── frontend/
    ├── index.html                # Upload form + project list
    ├── report.html               # Findings table, dashboard, AI explain button
    └── static/
        ├── style.css
        ├── app.js
        └── report.js
```

## Frontend design

The UI is a warm, hand-crafted "paper scrapbook" aesthetic — cream paper
background, thick ink borders, hard offset ("sticker") shadows, washi tape
decorations, tilted Georgia serif headlines, torn-paper labels, floating
stickers, and a confetti burst when a project scores a high quality rating.

This was adapted directly from a reference project the user provided
(a scrapbook-styled memory-matching game). The visual language —
color palette, ink-bordered cards, hard drop shadows, washi tape, torn
labels, floating stickers, and the confetti-burst technique — was pulled
from that project's `styles.css` / `app.js` and re-applied to DevGuardian's
actual screens (pipeline explainer, upload form, findings table, severity
badges, stat blocks) rather than copied verbatim, since the content is
completely different.

As before, everything is hand-rolled in plain CSS/JS with no build step,
matching the "runs on 8GB RAM, no framework" decision this project is
scoped around. **Lenis** (smooth inertial scrolling) is loaded as the real
library via CDN, using the same defensive `try/catch` init pattern as the
reference project — if the CDN is unreachable, native scrolling is used
instead and nothing breaks.

All of it lives in `frontend/static/`:
- `style.css` — the design system (paper grain, ink-bordered cards, washi tape, buttons, severity stickers, stat blocks, scroll-reveal, confetti)
- `effects.js` — shared behavior: Lenis init, scroll-reveal, animated counters, confetti burst
- `app.js` / `report.js` — page-specific logic (pipeline/report calls unchanged, now wired to the new UI; `report.js` fires confetti when quality score ≥ 90)

One robustness note carried over from the last redesign: the severity
chart (Chart.js, loaded from a CDN) is wrapped in its own try/catch — if
the CDN is unreachable, the rest of the report page still renders normally
instead of breaking.

## What's not here yet (by design, for this version)

- Level 2: AI-generated unit tests + sandboxed Docker execution (opt-in stage)
- Git repository import (ZIP upload only)
- Multi-user accounts / authentication
- PDF export (CSV export is included)
- Support for languages beyond Python and JavaScript/TypeScript

These are documented as future work in the project synopsis and can be added
without changing the core architecture.

## A note on Semgrep's `auto` config

The static analysis service uses `--config=auto`, which fetches rules from the
Semgrep registry on first run and needs an internet connection. If you're
offline, edit `backend/app/services/static_analysis.py` and change the
`SEMGREP_CONFIG` value to a locally cached ruleset instead.
