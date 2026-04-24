"""
orchestrate_endpoint.py
Agrega el endpoint /orchestrate al servidor FastAPI principal.
Conecta la ruta API de Next.js con el orquestador LangGraph.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import logging

from orchestrator import build_correction_graph

logger = logging.getLogger(__name__)
router = APIRouter()

# El grafo se compila una sola vez al levantar el servidor
_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = build_correction_graph()
    return _graph


class OrchestrationRequest(BaseModel):
    image_url: str
    assessment_id: str
    submission_id: str
    student_id: str
    question_id: str
    subject: str = "math"
    question_statement: str = ""
    max_points: float = 2.0
    rubric: dict = {}


@router.post("/orchestrate")
async def orchestrate_correction(req: OrchestrationRequest):
    """
    Recibe una imagen de ejercicio y ejecuta el pipeline completo:
    OCR → parse → evaluate → apply limits → decide review → finalize.
    """
    graph = get_graph()

    initial_state = {
        "image_url": req.image_url,
        "assessment_id": req.assessment_id,
        "submission_id": req.submission_id,
        "student_id": req.student_id,
        "question_id": req.question_id,
        "subject": req.subject,
        "question_statement": req.question_statement,
        "max_points": req.max_points,
        "rubric": req.rubric,
        "review_status": "pending",
        "warnings": [],
        # Campos que se llenan durante el pipeline
        "ocr_text": None,
        "math_steps": None,
        "final_answer": None,
        "ocr_confidence": None,
        "ocr_provider": None,
        "ai_score": None,
        "ai_errors": None,
        "ai_feedback": None,
        "ai_teacher_note": None,
        "ai_raw_output": None,
        "final_score": None,
        "error": None,
    }

    try:
        final_state = await graph.ainvoke(initial_state)
        logger.info(
            f"[Orchestrate] q={req.question_id} | "
            f"score={final_state.get('final_score')} | "
            f"status={final_state.get('review_status')}"
        )
        return final_state

    except Exception as e:
        logger.error(f"[Orchestrate] Pipeline error: {e}")
        return {
            **initial_state,
            "error": str(e),
            "review_status": "manual_required",
            "warnings": [f"Pipeline falló: {str(e)}"]
        }
