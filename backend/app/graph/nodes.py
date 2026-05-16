import json
from typing import Dict, Any
from app.graph.state import ResumeGraphState
from app.core.prompts import PARSE_RESUME_PROMPT, ANALYZE_JD_PROMPT, OPTIMIZE_RESUME_PROMPT
from app.services.llm_factory import LLMProviderFactory
from app.core.config import settings
from app.core.logging import logger

async def _call_llm_json(prompt: str) -> Dict[str, Any]:
    """Helper to call LLM and parse JSON output safely."""
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
        return json.loads(cleaned_text)
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
    except Exception as e:
        logger.error("parse_resume node failed", exc_info=True)
        raise

async def analyze_jd(state: ResumeGraphState) -> Dict[str, Any]:
    """Node to extract target keywords from the job description text."""
    logger.info("Starting node: analyze_jd")
    jd_text = state.get("jd_text")
    if not jd_text:
        # If no JD is provided, we skip analysis
        logger.info("No JD provided, skipping analysis")
        return {"jd_keywords": []}
        
    prompt = ANALYZE_JD_PROMPT.format(jd_text=jd_text)
    try:
        jd_analysis = await _call_llm_json(prompt)
        keywords = jd_analysis.get("core_skills", []) + jd_analysis.get("soft_skills", [])
        return {"jd_keywords": keywords} # we might want to store the whole analysis in state later
    except Exception as e:
        logger.error("analyze_jd node failed", exc_info=True)
        raise

async def optimize_resume(state: ResumeGraphState) -> Dict[str, Any]:
    """Node to optimize the structured resume against analyzed job keywords and user prompts."""
    logger.info("Starting node: optimize_resume")
    structured_resume = state.get("structured_resume")
    jd_text = state.get("jd_text")
    additional_prompt = state.get("additional_prompt", "")
    jd_keywords = state.get("jd_keywords", [])
    
    if not structured_resume:
        raise ValueError("Missing structured_resume in state")
        
    if not jd_text and not additional_prompt:
        logger.info("No JD and no additional prompt found, skipping optimization")
        return {"optimized_resume": structured_resume}
        
    prompt = OPTIMIZE_RESUME_PROMPT.format(
        structured_resume=json.dumps(structured_resume, indent=2),
        jd_analysis=json.dumps({"keywords": jd_keywords, "jd": jd_text}),
        additional_instructions=additional_prompt if additional_prompt else "No additional instructions provided."
    )
    
    try:
        optimized_data = await _call_llm_json(prompt)
        return {"optimized_resume": optimized_data}
    except Exception as e:
        logger.error("optimize_resume node failed", exc_info=True)
        # Fallback to unoptimized
        return {"optimized_resume": structured_resume}

async def generate_pdf(state: ResumeGraphState) -> Dict[str, Any]:
    """Node to generate a PDF file from the optimized resume state, and upload it to S3."""
    logger.info("Starting node: generate_pdf")
    optimized_resume = state.get("optimized_resume")
    jd_text = state.get("jd_text")
    user_id = state.get("user_id", "unknown")
    if not optimized_resume:
        raise ValueError("Missing optimized_resume in state")
        
    from app.latex.generator import LatexGenerator
    from app.services.s3_service import S3Service
    import uuid
    import tempfile
    import os
    
    generator = LatexGenerator()
    s3_service = S3Service()
    
    try:
        # Generate the PDF locally
        output_dir = tempfile.gettempdir()
        filename = f"resume_{user_id}_{uuid.uuid4().hex[:8]}"
        pdf_path = await generator.generate_pdf(optimized_resume, output_dir=output_dir, filename=filename, jd_text=jd_text)
        
        # Upload to S3
        s3_object_name = f"resumes/{user_id}/{os.path.basename(pdf_path)}"
        upload_success = await s3_service.upload_file(pdf_path, s3_object_name)
        
        pdf_s3_url = None
        if upload_success:
            # Generate a 1-hour presigned URL for secure frontend download
            pdf_s3_url = await s3_service.generate_presigned_url(s3_object_name, expiration=3600)
            
        return {"pdf_path": pdf_path, "pdf_s3_url": pdf_s3_url}
        
    except Exception as e:
        logger.error("generate_pdf node failed", exc_info=True)
        raise
