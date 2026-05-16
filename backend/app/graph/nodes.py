import json
import re
from typing import Any, Dict

from app.core.config import settings
from app.core.logging import logger
from app.core.prompts import ANALYZE_JD_PROMPT, OPTIMIZE_RESUME_PROMPT, PARSE_RESUME_PROMPT
from app.graph.state import ResumeGraphState
from app.services.cache import RedisCache
from app.services.llm_factory import LLMProviderFactory


def _safe_resume_filename_prefix(filename: str | None) -> str:
    """Return a filesystem-safe prefix based on the uploaded resume filename."""
    if not filename:
        return "resume"

    stem = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].rsplit(".", 1)[0]
    prefix = re.sub(r"[^A-Za-z0-9]+", "-", stem).strip("-").lower()
    return prefix[:80] or "resume"


async def _call_llm_json(prompt: str) -> Dict[str, Any]:
    """Call the configured LLM, cache JSON responses, and parse output safely."""
    cache = RedisCache(namespace="llm-json")
    cache_key = cache.digest(f"{settings.DEFAULT_AI_PROVIDER}:{settings.OPENAI_MODEL}:{settings.ANTHROPIC_MODEL}:{prompt}")
    cached = await cache.get_json(cache_key)
    if cached is not None:
        logger.info("LLM JSON cache hit")
        return cached

    provider = LLMProviderFactory.create(settings.DEFAULT_AI_PROVIDER)
    response_text = await provider.generate(prompt)

    # Clean up potential markdown formatting block if present
    cleaned_text = response_text.strip()
    if cleaned_text.startswith("```json"):
        cleaned_text = cleaned_text[7:]
    elif cleaned_text.startswith("```"):
        cleaned_text = cleaned_text[3:]
    if cleaned_text.endswith("```"):
        cleaned_text = cleaned_text[:-3]

    cleaned_text = cleaned_text.strip()

    try:
        parsed = json.loads(cleaned_text)
        await cache.set_json(cache_key, parsed, settings.CACHE_LLM_TTL_SECONDS)
        return parsed
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM JSON response: {cleaned_text}")
        raise ValueError("LLM returned malformed JSON") from e


async def parse_resume(state: ResumeGraphState) -> Dict[str, Any]:
    """Node to parse raw resume text into a structured JSON map."""
    logger.info("Starting node: parse_resume")
    raw_text = state.get("raw_resume_text")
    if not raw_text:
        raise ValueError("Missing raw_resume_text in state")

    prompt = PARSE_RESUME_PROMPT.format(raw_text=raw_text)
    try:
        structured_data = await _call_llm_json(prompt)
        return {"structured_resume": structured_data}
    except Exception:
        logger.error("parse_resume node failed", exc_info=True)
        raise


async def analyze_jd(state: ResumeGraphState) -> Dict[str, Any]:
    """Node to extract target keywords from the job description text."""
    logger.info("Starting node: analyze_jd")
    jd_text = state.get("jd_text")
    if not jd_text:
        # If no JD is provided, we skip analysis
        logger.info("No JD provided, skipping analysis")
        return {"jd_keywords": [], "jd_analysis": {}}

    prompt = ANALYZE_JD_PROMPT.format(jd_text=jd_text)
    try:
        jd_analysis = await _call_llm_json(prompt)
        keywords = jd_analysis.get("core_skills", []) + jd_analysis.get("soft_skills", [])
        return {"jd_keywords": keywords, "jd_analysis": jd_analysis}
    except Exception:
        logger.error("analyze_jd node failed", exc_info=True)
        raise


async def optimize_resume(state: ResumeGraphState) -> Dict[str, Any]:
    """Node to optimize the structured resume against analyzed job keywords and user prompts."""
    logger.info("Starting node: optimize_resume")
    structured_resume = state.get("structured_resume")
    jd_text = state.get("jd_text")
    additional_prompt = state.get("additional_prompt", "")
    jd_keywords = state.get("jd_keywords", [])
    jd_analysis = state.get("jd_analysis", {})

    if not structured_resume:
        raise ValueError("Missing structured_resume in state")

    if not jd_text and not additional_prompt:
        logger.info("No JD and no additional prompt found, skipping optimization")
        return {"optimized_resume": structured_resume}

    prompt = OPTIMIZE_RESUME_PROMPT.format(
        structured_resume=json.dumps(structured_resume, indent=2),
        jd_analysis=json.dumps({**jd_analysis, "keywords": jd_keywords, "jd": jd_text}),
        additional_instructions=(additional_prompt if additional_prompt else "No additional instructions provided."),
    )

    try:
        optimized_data = await _call_llm_json(prompt)
        return {"optimized_resume": optimized_data}
    except Exception:
        logger.error("optimize_resume node failed", exc_info=True)
        # Fallback to unoptimized
        return {"optimized_resume": structured_resume}


async def generate_pdf(state: ResumeGraphState) -> Dict[str, Any]:
    """Node to generate a PDF file from the optimized resume state, and upload it to S3."""
    logger.info("Starting node: generate_pdf")
    optimized_resume = state.get("optimized_resume")
    jd_text = state.get("jd_text")
    resume_filename = state.get("resume_filename")
    if not optimized_resume:
        raise ValueError("Missing optimized_resume in state")

    import tempfile
    import uuid

    from app.latex.generator import LatexGenerator
    from app.services.s3_service import S3Service

    generator = LatexGenerator()
    s3_service = S3Service()

    try:
        # Generate the PDF locally
        output_dir = tempfile.gettempdir()
        filename = f"{_safe_resume_filename_prefix(resume_filename)}-optimized-{uuid.uuid4().hex[:10]}"
        pdf_path = await generator.generate_pdf(optimized_resume, output_dir=output_dir, filename=filename, jd_text=jd_text)

        # Upload to S3
        s3_object_name = f"r/{uuid.uuid4().hex[:20]}.pdf"
        upload_success = await s3_service.upload_file(pdf_path, s3_object_name)

        pdf_s3_key = None
        if upload_success:
            pdf_s3_key = s3_object_name

        return {"pdf_path": pdf_path, "pdf_s3_url": None, "pdf_s3_key": pdf_s3_key}

    except Exception:
        logger.error("generate_pdf node failed", exc_info=True)
        raise
