import base64
import os
import re
import secrets
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import enforce_general_rate_limit, enforce_llm_rate_limit
from app.core.logging import logger
from app.db.database import get_db
from app.graph.state import ResumeGraphState
from app.graph.workflow import app as langgraph_app
from app.models.resume import JobDescription, OptimizationHistory, Resume, ResumeVersion
from app.models.user import User
from app.parsers.document_parser import DocumentParserFactory
from app.services.job_description_fetcher import (
    JobDescriptionFetchError,
    fetch_job_description_text,
)
from app.services.s3_service import S3PresignedUrlService

router = APIRouter()


async def _create_download_token(db: AsyncSession) -> str:
    """Create a short, unique token for opening a generated resume.

    Args:
        db: Request-scoped async database session.

    Returns:
        A URL-safe token suitable for compact download links.

    Raises:
        RuntimeError: When a unique token cannot be generated after retries.
    """
    for _ in range(8):
        token = secrets.token_urlsafe(8)
        existing = await db.scalar(select(OptimizationHistory.id).where(OptimizationHistory.download_token == token))
        if not existing:
            return token

    raise RuntimeError("Could not create a unique resume download token.")


def _safe_download_filename(prefix: Optional[str], unique_value: str) -> str:
    """Build a browser download filename from a resume title and unique token."""
    cleaned_prefix = re.sub(r"[^A-Za-z0-9]+", "-", prefix or "").strip("-").lower()
    if cleaned_prefix.endswith("-optimized"):
        cleaned_prefix = cleaned_prefix[: -len("-optimized")]
    cleaned_prefix = cleaned_prefix[:80].strip("-") or "resume"
    cleaned_unique = re.sub(r"[^A-Za-z0-9]+", "", unique_value)[:16] or secrets.token_hex(6)
    return f"{cleaned_prefix}-optimized-{cleaned_unique}.pdf"


async def _history_download_filename(history: OptimizationHistory, db: AsyncSession) -> str:
    """Resolve the intended user-facing PDF filename for a saved history item."""
    resume_title = None
    if history.resume_id:
        resume_title = await db.scalar(select(Resume.title).where(Resume.id == history.resume_id))
    unique_value = history.download_token or str(history.id)
    return _safe_download_filename(resume_title, unique_value)


def _build_jd_title(job_description: Optional[str], job_description_url: Optional[str]) -> str:
    """Create a readable job-description label for filters and history rows.

    Args:
        job_description: Pasted job description text from the user.
        job_description_url: Optional source URL for the job posting.

    Returns:
        A short display label derived from the URL or first JD text line.
    """
    if job_description_url:
        return job_description_url[:255]

    if not job_description:
        return "No job description"

    first_line = next((line.strip() for line in job_description.splitlines() if line.strip()), "")
    return first_line[:80] or "Pasted job description"


def _clean_jd_field(value: Any) -> Optional[str]:
    """Normalize optional JD metadata returned by the LLM.

    Args:
        value: Raw JSON field value from JD analysis.

    Returns:
        A stripped string, or None when the value is empty/null-like.
    """
    if value is None:
        return None

    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a", "not specified", "unknown"}:
        return None

    return text[:255]


def _format_jd_display(title: Optional[str], company: Optional[str]) -> tuple[str, Optional[str]]:
    """Create clean role/company display values for new and legacy JD rows.

    Args:
        title: Stored JD title, sometimes a raw hiring post headline.
        company: Stored company name, when available.

    Returns:
        A pair of display title and display company.
    """
    display_title = _clean_jd_field(title) or "No job description"
    display_company = _clean_jd_field(company)

    if "|" in display_title and not display_company:
        left, right = display_title.split("|", 1)
        display_title = left.strip()
        display_company = _clean_jd_field(right)

    display_title = re.sub(r"^[^\w]+", "", display_title).strip()
    display_title = re.sub(
        r"^(we\s+are\s+)?(hiring|job opening|opening|role)\s*:\s*",
        "",
        display_title,
        flags=re.I,
    ).strip()

    return display_title or "No job description", display_company


def _serialize_history_item(
    history: OptimizationHistory,
    resume: Optional[Resume],
    jd: Optional[JobDescription],
) -> Dict[str, Any]:
    """Convert joined history, resume, and JD rows into an API response item.

    Args:
        history: Optimization history row.
        resume: Linked resume row, when present.
        jd: Linked job-description row, when present.

    Returns:
        A JSON-serializable dictionary for the frontend CV library.
    """
    download_url = None
    if history.download_token:
        download_url = f"/resume/d/{history.download_token}"
    elif history.generated_pdf_path or history.generated_pdf_url or history.generated_pdf_s3_key:
        download_url = f"/resume/history/{history.id}/pdf"

    jd_title, jd_company = _format_jd_display(jd.title if jd else None, jd.company if jd else None)

    return {
        "id": str(history.id),
        "resume_id": str(history.resume_id) if history.resume_id else None,
        "jd_id": str(history.jd_id) if history.jd_id else None,
        "resume_title": resume.title if resume else "Optimized Resume",
        "resume_url": download_url,
        "download_url": download_url,
        "jd_title": jd_title,
        "jd_company": jd_company,
        "jd_source_url": jd.source_url if jd else None,
        "ats_score": history.ats_score_after,
        "created_at": history.created_at.isoformat() if history.created_at else None,
    }


@router.post("/extract")
async def extract_resume_text(
    file: UploadFile = File(...),
    current_user: User = Depends(enforce_general_rate_limit),
) -> Dict[str, str]:
    """Extract raw text from an uploaded resume file.

    Args:
        file: Resume document uploaded as PDF, DOCX, or TXT.
        current_user: Authenticated user resolved from the bearer token.

    Returns:
        The original filename and extracted plain text.

    Raises:
        HTTPException: 400 for unsupported or unreadable documents, 500 for server errors.
    """
    try:
        parser = DocumentParserFactory.get_parser(file.filename, file.content_type)
        text = await parser.extract_text(file)
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract any text from the document.")
        return {"filename": file.filename, "extracted_text": text}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.error("Failed to extract resume text", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during text extraction.")


@router.post("/optimize")
async def optimize_resume(
    resume_text: str = Form(...),
    job_description: Optional[str] = Form(None),
    job_description_url: Optional[str] = Form(None),
    resume_filename: Optional[str] = Form(None),
    additional_prompt: Optional[str] = Form(None),
    current_user: User = Depends(enforce_llm_rate_limit),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Parse, optimize, generate, and persist a resume optimization run.

    Args:
        resume_text: Plain text extracted from the uploaded resume.
        job_description: Optional pasted job description text.
        job_description_url: Optional URL where the job description came from.
        resume_filename: Optional original filename for display in history.
        additional_prompt: Optional user instructions for optimization tone or focus.
        current_user: Authenticated user resolved from the bearer token.
        db: Request-scoped async database session.

    Returns:
        Workflow outputs, generated PDF metadata, and IDs for saved history records.

    Raises:
        HTTPException: 500 when optimization, PDF generation, or persistence fails.
    """
    try:
        resolved_job_description = job_description or ""
        jd_text_source = "pasted" if resolved_job_description else None
        if not resolved_job_description and job_description_url:
            try:
                resolved_job_description = await fetch_job_description_text(
                    job_description_url
                )
                jd_text_source = "url"
            except JobDescriptionFetchError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        # Initial state for the LangGraph workflow
        initial_state: ResumeGraphState = {
            "user_id": (str(current_user.id) if hasattr(current_user, "id") else "unknown"),
            "resume_filename": resume_filename,
            "raw_resume_text": resume_text,
            "jd_text": resolved_job_description,
            "additional_prompt": additional_prompt or "",
            "jd_keywords": [],
            "jd_analysis": {},
            "structured_resume": {},
            "optimized_resume": {},
            "pdf_path": "",
            "pdf_s3_url": None,
            "pdf_s3_key": None,
            "ats_score": 0.0,
            "generated_latex": "",
            "errors": [],
        }

        logger.info(f"Starting workflow for user {current_user.email}")

        # Run the workflow
        result = await langgraph_app.ainvoke(initial_state)

        # Calculate a basic ATS Score if JD is provided
        ats_score = 0
        jd_keywords = result.get("jd_keywords", [])
        jd_analysis = result.get("jd_analysis") or {}
        opt_resume_text = str(result.get("optimized_resume", {})).lower()
        if jd_keywords:
            matches = [kw for kw in jd_keywords if kw.lower() in opt_resume_text]
            ats_score = int((len(matches) / len(jd_keywords)) * 100) if jd_keywords else 0

        pdf_base64 = ""
        pdf_path = result.get("pdf_path")
        pdf_s3_key = result.get("pdf_s3_key")

        if pdf_path and os.path.exists(pdf_path) and not pdf_s3_key:
            with open(pdf_path, "rb") as pdf_file:
                pdf_base64 = base64.b64encode(pdf_file.read()).decode("utf-8")

        resume_title_prefix = Path(resume_filename).stem.strip() if resume_filename else "resume"
        resume_title = f"{resume_title_prefix} optimized"
        download_token = await _create_download_token(db)
        resume_url = f"/resume/d/{download_token}" if (pdf_path or pdf_s3_key) else None
        resume = Resume(
            user_id=current_user.id,
            title=resume_title,
            resume_url=resume_url,
            raw_text=resume_text,
            structured_data=result.get("optimized_resume") or result.get("structured_resume"),
        )
        db.add(resume)
        await db.flush()

        db.add(
            ResumeVersion(
                resume_id=resume.id,
                structured_data=result.get("optimized_resume") or result.get("structured_resume"),
                version_number="1",
            )
        )

        jd = None
        if resolved_job_description or job_description_url:
            analyzed_title = _clean_jd_field(jd_analysis.get("job_title"))
            analyzed_company = _clean_jd_field(jd_analysis.get("company_name"))
            jd = JobDescription(
                user_id=current_user.id,
                title=analyzed_title
                or _build_jd_title(resolved_job_description, job_description_url),
                company=analyzed_company,
                source_url=job_description_url,
                raw_text=resolved_job_description,
                parsed_keywords={**jd_analysis, "keywords": jd_keywords},
            )
            db.add(jd)
            await db.flush()

        history = OptimizationHistory(
            user_id=current_user.id,
            resume_id=resume.id,
            jd_id=jd.id if jd else None,
            ats_score_before=None,
            ats_score_after=ats_score,
            generated_pdf_path=pdf_path,
            generated_pdf_url=None,
            generated_pdf_s3_key=pdf_s3_key,
            download_token=download_token,
        )
        db.add(history)
        await db.commit()
        await db.refresh(history)

        return {
            "optimization_id": str(history.id),
            "resume_id": str(resume.id),
            "jd_id": str(jd.id) if jd else None,
            "structured_resume": result.get("structured_resume"),
            "optimized_resume": result.get("optimized_resume"),
            "jd_keywords": jd_keywords,
            "pdf_path": pdf_path,
            "pdf_base64": pdf_base64,
            "pdf_s3_url": None,
            "download_url": (f"/resume/d/{history.download_token}" if history.download_token and (pdf_path or pdf_s3_key) else None),
            "resume_url": resume_url,
            "jd_title": jd.title if jd else "No job description",
            "jd_company": jd.company if jd else None,
            "jd_source_url": jd.source_url if jd else None,
            "jd_text_source": jd_text_source,
            "ats_score": ats_score,
        }
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.error("Failed to optimize resume", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while processing the resume. Please try again later.",
        )


@router.get("/history")
async def list_resume_history(
    jd_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """List generated resume runs for the authenticated user.

    Args:
        jd_id: Optional job-description UUID used to filter history rows.
        search: Optional case-insensitive search across resume and JD labels.
        current_user: Authenticated user resolved from the bearer token.
        db: Request-scoped async database session.

    Returns:
        History items plus distinct job-description filter options.

    Raises:
        HTTPException: 400 when `jd_id` is not a valid UUID.
    """
    stmt = (
        select(OptimizationHistory, Resume, JobDescription)
        .outerjoin(Resume, OptimizationHistory.resume_id == Resume.id)
        .outerjoin(JobDescription, OptimizationHistory.jd_id == JobDescription.id)
        .where(OptimizationHistory.user_id == current_user.id)
        .order_by(desc(OptimizationHistory.created_at))
    )

    if jd_id:
        try:
            stmt = stmt.where(OptimizationHistory.jd_id == UUID(jd_id))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid job description id.") from exc

    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                Resume.title.ilike(like),
                JobDescription.title.ilike(like),
                JobDescription.source_url.ilike(like),
                JobDescription.company.ilike(like),
            )
        )

    rows = (await db.execute(stmt)).all()
    items = [_serialize_history_item(history, resume, jd) for history, resume, jd in rows]

    jd_options = []
    seen_jds = set()
    for item in items:
        if item["jd_id"] and item["jd_id"] not in seen_jds:
            seen_jds.add(item["jd_id"])
            jd_options.append(
                {
                    "id": item["jd_id"],
                    "title": item["jd_title"],
                    "company": item["jd_company"],
                    "source_url": item["jd_source_url"],
                }
            )

    return {"items": items, "jd_options": jd_options}


@router.get("/d/{download_token}")
async def download_resume_by_token(
    download_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate one presigned URL for a compact resume download link.

    History and list APIs return this short app link instead of generating
    presigned URLs in bulk. S3 signing happens only when the user clicks this
    specific resume link.

    Args:
        download_token: Short URL-safe token attached to one generated resume.
        db: Request-scoped async database session.

    Returns:
        A redirect to a fresh presigned URL, or a local file response.

    Raises:
        HTTPException: 404 when the token is unknown or the PDF cannot be read.
    """
    history = await db.scalar(select(OptimizationHistory).where(OptimizationHistory.download_token == download_token))
    if not history:
        raise HTTPException(status_code=404, detail="Resume download link not found.")

    return await _open_history_pdf(history, db)


@router.get("/history/{optimization_id}/pdf")
async def get_history_pdf(
    optimization_id: str,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Open a saved generated resume PDF for a history record.

    Private S3 objects are never signed during list or history retrieval. When
    a user opens one specific resume, this endpoint generates exactly one fresh
    presigned URL and redirects the browser to it. Local files remain supported
    for development.

    Args:
        optimization_id: Optimization history UUID.
        current_user: Authenticated user resolved from the bearer token.
        db: Request-scoped async database session.

    Returns:
        A redirect to a fresh presigned S3 URL, or a local FileResponse.

    Raises:
        HTTPException: 400 for invalid UUIDs and 404 when the record or file is missing.
    """
    try:
        history_id = UUID(optimization_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid resume history id.") from exc

    result = await db.execute(
        select(OptimizationHistory).where(
            OptimizationHistory.id == history_id,
            OptimizationHistory.user_id == current_user.id,
        )
    )
    history = result.scalar_one_or_none()
    if not history:
        raise HTTPException(status_code=404, detail="Resume history item not found.")

    return await _open_history_pdf(history, db)


async def _open_history_pdf(history: OptimizationHistory, db: AsyncSession):
    """Open one generated resume from S3 or local disk.

    Args:
        history: Optimization history row containing file metadata.

    Returns:
        A redirect to a fresh presigned S3 URL or a local FileResponse.

    Raises:
        HTTPException: 404 when no readable generated resume exists.
    """
    download_filename = await _history_download_filename(history, db)
    presigned_urls = S3PresignedUrlService()
    s3_key = history.generated_pdf_s3_key or presigned_urls.object_key_from_url(history.generated_pdf_url)
    if s3_key:
        signed_url = await presigned_urls.generate_presigned_url(s3_key, expiration=3600, download_filename=download_filename)
        if signed_url:
            return RedirectResponse(signed_url)

        logger.warning(f"Could not generate presigned URL for history item {history.id}")

    if history.generated_pdf_path and os.path.exists(history.generated_pdf_path):
        return FileResponse(
            history.generated_pdf_path,
            media_type="application/pdf",
            filename=download_filename,
        )

    raise HTTPException(status_code=404, detail="Generated resume PDF is no longer available.")
