from typing import TypedDict, List, Dict, Any, Optional

class ResumeGraphState(TypedDict):
    user_id: str
    raw_resume_text: str
    structured_resume: Dict[str, Any]
    jd_text: str
    jd_keywords: List[str]
    optimized_resume: Dict[str, Any]
    ats_score: float
    generated_latex: str
    pdf_path: str
    errors: List[str]
