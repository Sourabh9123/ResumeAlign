from typing import TypedDict, List, Dict, Any, Optional

class ResumeGraphState(TypedDict):
    """Shared state passed between LangGraph resume workflow nodes."""

    user_id: str
    raw_resume_text: str
    structured_resume: Dict[str, Any]
    jd_text: str
    additional_prompt: str
    jd_keywords: List[str]
    optimized_resume: Dict[str, Any]
    ats_score: float
    generated_latex: str
    pdf_path: str
    pdf_s3_url: Optional[str]
    errors: List[str]
