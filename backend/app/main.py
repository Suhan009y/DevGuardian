from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.database import init_db
from app.routers import projects

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

app = FastAPI(
    title="DevGuardian",
    description="AI-assisted code review platform — Level 1 MVP",
    version="0.1.0",
)

# Permissive CORS for local development; this is a single-user local tool,
# not a multi-tenant deployed service.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/report.html")
def serve_report():
    return FileResponse(FRONTEND_DIR / "report.html")


app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")
