from langgraph.graph import END, StateGraph

from app.graph.nodes import analyze_jd, generate_pdf, optimize_resume, parse_resume
from app.graph.state import ResumeGraphState


def build_graph():
    """Build and compile the LangGraph resume optimization workflow."""
    try:
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
    except Exception as e:
        from app.core.logging import logger

        logger.error(f"Failed to build or compile LangGraph workflow: {str(e)}", exc_info=True)
        raise


try:
    app = build_graph()
except Exception as e:
    from app.core.logging import logger

    logger.critical(f"Critical error initializing application graph: {str(e)}")
    raise
