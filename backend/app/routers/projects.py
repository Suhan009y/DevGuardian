import csv
import io
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR
from app.database import get_db
from app import models, schemas
from app.services.extract import safe_extract_zip, UnsafeZipError
from app.services.detect_language import detect_language
from app.services.static_analysis import run_semgrep, StaticAnalysisError
from app.services.dependency_scan import run_dependency_scan
from app.services.normalize import normalize_findings
from app.services.quality_score import calculate_quality_score
from app.services.ai_explain import explain_finding, AIExplainError

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _project_or_404(db: Session, project_id: int) -> models.Project:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.post("/upload", response_model=schemas.ProjectDetail)
def upload_project(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip uploads are supported.")

    # Persist the upload to a per-project working directory.
    project = models.Project(name=Path(file.filename).stem, status="uploaded")
    db.add(project)
    db.commit()
    db.refresh(project)

    project_dir = UPLOAD_DIR / f"project_{project.id}_{uuid.uuid4().hex[:8]}"
    project_dir.mkdir(parents=True, exist_ok=True)
    zip_path = project_dir / "upload.zip"

    with zip_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    extracted_dir = project_dir / "extracted"
    try:
        safe_extract_zip(zip_path, extracted_dir)
    except UnsafeZipError as e:
        db.delete(project)
        db.commit()
        shutil.rmtree(project_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(e))

    # --- Pipeline: detect language -> static analysis -> dependency scan ---
    language, _ext_counts = detect_language(extracted_dir)
    project.language = language

    raw_findings: list[dict] = []
    try:
        raw_findings.extend(run_semgrep(extracted_dir))
    except StaticAnalysisError as e:
        raw_findings.append({
            "tool": "semgrep", "category": "bug", "severity": "info",
            "file": None, "line": None, "rule_id": None,
            "message": f"Static analysis skipped: {e}",
        })

    raw_findings.extend(run_dependency_scan(extracted_dir))

    normalized = normalize_findings(raw_findings)

    for f in normalized:
        db.add(models.Finding(project_id=project.id, **f))

    project.quality_score = calculate_quality_score(normalized)
    project.status = "analyzed"
    db.commit()
    db.refresh(project)

    return _to_project_detail(project)


@router.get("", response_model=list[schemas.ProjectSummary])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(models.Project).order_by(models.Project.uploaded_at.desc()).all()
    return [
        schemas.ProjectSummary(
            id=p.id,
            name=p.name,
            language=p.language,
            uploaded_at=p.uploaded_at,
            quality_score=p.quality_score,
            status=p.status,
            finding_count=len(p.findings),
        )
        for p in projects
    ]


@router.get("/{project_id}", response_model=schemas.ProjectDetail)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)
    return _to_project_detail(project)


@router.post("/{project_id}/explain", response_model=schemas.ProjectDetail)
def explain_project(project_id: int, db: Session = Depends(get_db)):
    """
    Generates AI explanations for every finding that doesn't already have one.
    Runs sequentially (one Ollama call at a time) — see ai_explain.py for why.
    """
    project = _project_or_404(db, project_id)
    pending = [f for f in project.findings if not f.ai_explanation]

    if not pending:
        return _to_project_detail(project)

    for finding in pending:
        try:
            result = explain_finding({
                "tool": finding.tool, "severity": finding.severity,
                "file": finding.file, "line": finding.line,
                "rule_id": finding.rule_id, "message": finding.message,
            })
            finding.ai_explanation = result["explanation"]
            finding.ai_suggested_fix = result["suggested_fix"]
        except AIExplainError as e:
            finding.ai_explanation = f"AI explanation unavailable: {e}"
            finding.ai_suggested_fix = ""

    project.status = "explained"
    db.commit()
    db.refresh(project)
    return _to_project_detail(project)


@router.get("/{project_id}/dashboard", response_model=schemas.DashboardSummary)
def project_dashboard(project_id: int, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)

    by_severity: dict[str, int] = {}
    by_category: dict[str, int] = {}
    by_tool: dict[str, int] = {}
    for f in project.findings:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1
        by_category[f.category] = by_category.get(f.category, 0) + 1
        by_tool[f.tool] = by_tool.get(f.tool, 0) + 1

    return schemas.DashboardSummary(
        quality_score=project.quality_score,
        total_findings=len(project.findings),
        by_severity=by_severity,
        by_category=by_category,
        by_tool=by_tool,
    )


@router.get("/{project_id}/export.csv")
def export_project_csv(project_id: int, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "tool", "category", "severity", "file", "line", "rule_id",
        "message", "ai_explanation", "ai_suggested_fix",
    ])
    for f in project.findings:
        writer.writerow([
            f.tool, f.category, f.severity, f.file, f.line, f.rule_id,
            f.message, f.ai_explanation or "", f.ai_suggested_fix or "",
        ])
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=devguardian_project_{project_id}.csv"},
    )


def _to_project_detail(project: models.Project) -> schemas.ProjectDetail:
    return schemas.ProjectDetail(
        id=project.id,
        name=project.name,
        language=project.language,
        uploaded_at=project.uploaded_at,
        quality_score=project.quality_score,
        status=project.status,
        finding_count=len(project.findings),
        findings=[schemas.FindingOut.model_validate(f) for f in project.findings],
    )
