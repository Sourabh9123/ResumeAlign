from langgraph.graph import StateGraph, END
from app.graph.state import ResumeGraphState
from app.graph.nodes import parse_resume, analyze_jd, optimize_resume, generate_pdf

def build_graph():
    """Build and compile the LangGraph resume optimization workflow."""
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
