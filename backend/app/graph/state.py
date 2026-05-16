from typing import Any, Dict, List, Optional, TypedDict


class ResumeGraphState(TypedDict):
    """Shared state passed between LangGraph resume workflow nodes."""

    user_id: str
    resume_filename: Optional[str]
    raw_resume_text: str
    structured_resume: Dict[str, Any]
    jd_text: str
    jd_analysis: Dict[str, Any]
    additional_prompt: str
    jd_keywords: List[str]
    optimized_resume: Dict[str, Any]
    ats_score: float
    generated_latex: str
    pdf_path: str
    pdf_s3_url: Optional[str]
    pdf_s3_key: Optional[str]
    errors: List[str]
