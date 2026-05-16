from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from typing import Optional, Dict, Any
from app.parsers.document_parser import DocumentParserFactory
from app.graph.workflow import app as langgraph_app
from app.core.logging import logger
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.post("/extract")
async def extract_resume_text(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Extract raw text from an uploaded resume file."""
    try:
        parser = DocumentParserFactory.get_parser(file.filename, file.content_type)
        text = await parser.extract_text(file)
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract any text from the document.")
        return {"filename": file.filename, "extracted_text": text}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to extract resume text", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during text extraction.")

@router.post("/optimize")
async def optimize_resume(
    resume_text: str = Form(...),
    job_description: Optional[str] = Form(None),
    additional_prompt: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Run the LangGraph workflow to parse and optionally optimize a resume."""
    try:
        # Initial state for the LangGraph workflow
        initial_state = {
            "user_id": str(current_user.id) if hasattr(current_user, "id") else "unknown",
            "raw_resume_text": resume_text,
            "jd_text": job_description or "",
            "additional_prompt": additional_prompt or "",
            "jd_keywords": [],
            "structured_resume": {},
            "optimized_resume": {},
            "pdf_path": "",
            "ats_score": 0.0,
            "generated_latex": "",
            "errors": []
        }
        
        logger.info(f"Starting workflow for user {current_user.email}")
        
        # Run the workflow
        result = await langgraph_app.ainvoke(initial_state)
        
        # Calculate a basic ATS Score if JD is provided
        ats_score = 0
        jd_keywords = result.get("jd_keywords", [])
        opt_resume_text = str(result.get("optimized_resume", {})).lower()
        if jd_keywords:
            matches = [kw for kw in jd_keywords if kw.lower() in opt_resume_text]
            ats_score = int((len(matches) / len(jd_keywords)) * 100) if jd_keywords else 0

        import base64
        import os
        
        pdf_base64 = ""
        pdf_path = result.get("pdf_path")
        if pdf_path and os.path.exists(pdf_path):
            with open(pdf_path, "rb") as pdf_file:
                pdf_base64 = base64.b64encode(pdf_file.read()).decode('utf-8')

        return {
            "structured_resume": result.get("structured_resume"),
            "optimized_resume": result.get("optimized_resume"),
            "jd_keywords": jd_keywords,
            "pdf_path": pdf_path,
            "pdf_base64": pdf_base64,
            "ats_score": ats_score
        }
    except Exception as e:
        logger.error("Failed to optimize resume", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while processing the resume. Please try again later.")
