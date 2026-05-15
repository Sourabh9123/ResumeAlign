from langgraph.graph import StateGraph, END
from app.graph.state import ResumeGraphState
from typing import Dict, Any

def parse_resume(state: ResumeGraphState) -> Dict[str, Any]:
    # Placeholder logic
    return {"structured_resume": {"name": "Parsed Name"}}

def analyze_jd(state: ResumeGraphState) -> Dict[str, Any]:
    # Placeholder logic
    return {"jd_keywords": ["Python", "FastAPI"]}

def optimize_resume(state: ResumeGraphState) -> Dict[str, Any]:
    # Placeholder logic using LLM
    return {"optimized_resume": {"name": "Parsed Name", "skills": ["Python"]}}

def generate_pdf(state: ResumeGraphState) -> Dict[str, Any]:
    # Placeholder logic
    return {"pdf_path": "/tmp/resume.pdf"}

def build_graph():
    workflow = StateGraph(ResumeGraphState)

    workflow.add_node("parse_resume", parse_resume)
    workflow.add_node("analyze_jd", analyze_jd)
    workflow.add_node("optimize_resume", optimize_resume)
    workflow.add_node("generate_pdf", generate_pdf)

    workflow.set_entry_point("parse_resume")
    workflow.add_edge("parse_resume", "analyze_jd")
    workflow.add_edge("analyze_jd", "optimize_resume")
    workflow.add_edge("optimize_resume", "generate_pdf")
    workflow.add_edge("generate_pdf", END)

    return workflow.compile()

app = build_graph()
