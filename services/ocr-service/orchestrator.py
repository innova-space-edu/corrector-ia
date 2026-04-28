"""
orchestrator.py
Orquestador LangGraph para el pipeline de corrección IA.

Flujo de nodos:
  receive_image
       ↓
  ocr_extract
       ↓
  parse_response
       ↓
  evaluate_with_rubric
       ↓
  apply_rubric_limits  ← asegura que la IA no invente puntajes
       ↓
  decide_review ──────→ flag_for_manual_review
       ↓
  finalize_result
"""

from typing import TypedDict, Optional, Annotated
from langgraph.graph import StateGraph, END
import httpx
import json
import os
import logging

logger = logging.getLogger(__name__)

OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:8001")
AI_PROVIDER_API_KEY = os.getenv("AI_PROVIDER_API_KEY", "")
AI_PARSE_URL = os.getenv(
    "AI_PARSE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
)


# ─── STATE ────────────────────────────────────────────────────────────────────

class CorrectionState(TypedDict):
    # Input
    image_url: str
    assessment_id: str
    submission_id: str
    student_id: str
    question_id: str
    subject: str                      # math | language | science | history
    question_statement: str           # enunciado oficial del ejercicio
    max_points: float                 # puntaje máximo REAL (viene de la rúbrica)
    rubric: dict                      # rúbrica oficial del ítem

    # OCR results
    ocr_text: Optional[str]
    math_steps: Optional[list[str]]
    final_answer: Optional[str]
    ocr_confidence: Optional[float]
    ocr_provider: Optional[str]

    # Evaluation results
    ai_score: Optional[float]
    ai_errors: Optional[list[str]]
    ai_feedback: Optional[str]
    ai_teacher_note: Optional[str]
    ai_raw_output: Optional[str]

    # Final
    final_score: Optional[float]
    review_status: str                # auto | needs_review | manual_required
    warnings: Optional[list[str]]
    error: Optional[str]


# ─── NODOS ────────────────────────────────────────────────────────────────────

async def node_ocr_extract(state: CorrectionState) -> CorrectionState:
    """Llama al microservicio OCR y extrae texto de la imagen."""
    logger.info(f"[OCR] Procesando q={state['question_id']}")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Descargar imagen desde Supabase Storage
            img_response = await client.get(state["image_url"])
            img_response.raise_for_status()

            # Enviar al OCR service
            response = await client.post(
                f"{OCR_SERVICE_URL}/ocr",
                files={"file": ("image.jpg", img_response.content, "image/jpeg")},
                params={"subject": state["subject"], "question_id": state["question_id"]}
            )
            response.raise_for_status()
            data = response.json()

        return {
            **state,
            "ocr_text": data["text"],
            "math_steps": data.get("math_steps", []),
            "final_answer": data.get("final_answer"),
            "ocr_confidence": data["confidence"],
            "ocr_provider": data["provider_used"],
            "warnings": (state.get("warnings") or []) + data.get("warnings", [])
        }

    except Exception as e:
        logger.error(f"[OCR] Error: {e}")
        return {**state, "error": f"OCR falló: {str(e)}", "review_status": "manual_required"}


async def node_parse_response(state: CorrectionState) -> CorrectionState:
    """Limpia y estructura la respuesta del estudiante."""
    if state.get("error"):
        return state

    text = state.get("ocr_text", "")

    # Si el texto es muy corto, probablemente no hubo respuesta
    if len(text.strip()) < 3:
        warnings = (state.get("warnings") or []) + ["Texto OCR vacío o muy corto"]
        return {
            **state,
            "warnings": warnings,
            "review_status": "manual_required"
        }

    return state


async def node_evaluate_with_rubric(state: CorrectionState) -> CorrectionState:
    """Agente evaluador IA: aplica prompt de asignatura + rúbrica."""
    if state.get("error") or state.get("review_status") == "manual_required":
        return state

    prompt = _build_evaluation_prompt(state)

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                AI_PARSE_URL,
                headers={
                    "Authorization": f"Bearer {AI_PROVIDER_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gemini-2.5-flash-preview-05-20",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1000,
                    "temperature": 0.1,
                }
            )
            response.raise_for_status()
            raw_content = response.json()["choices"][0]["message"]["content"]

        # Parsear JSON de la respuesta
        evaluation = _parse_ai_evaluation(raw_content)

        return {
            **state,
            "ai_score": evaluation.get("score"),
            "ai_errors": evaluation.get("errors", []),
            "ai_feedback": evaluation.get("student_feedback"),
            "ai_teacher_note": evaluation.get("teacher_note"),
            "ai_raw_output": raw_content,
        }

    except Exception as e:
        logger.error(f"[Evaluator] Error: {e}")
        warnings = (state.get("warnings") or []) + [f"Evaluador IA falló: {str(e)}"]
        return {
            **state,
            "warnings": warnings,
            "review_status": "needs_review"
        }


def node_apply_rubric_limits(state: CorrectionState) -> CorrectionState:
    """
    CRÍTICO: La IA no decide el puntaje final. El sistema lo limita.
    Aplica reglas fijas sobre el puntaje sugerido por la IA.
    """
    if state.get("error"):
        return state

    ai_score = state.get("ai_score")
    max_points = state.get("max_points", 0)

    if ai_score is None:
        return state

    # Regla 1: nunca superar el máximo oficial
    capped_score = min(ai_score, max_points)

    # Regla 2: nunca negativo
    capped_score = max(capped_score, 0.0)

    # Regla 3: redondear a múltiplos de 0.25 (escala chilena)
    capped_score = round(capped_score * 4) / 4

    # Regla 4: SymPy valida el resultado numérico/algebraico final
    subject = state.get("subject", "math")
    correct_answer = state.get("correct_answer") or state.get("rubric_answer")
    ocr_text = state.get("ocr_text", "")

    sympy_info = {}
    if correct_answer and subject in ("math", "ciencias", "science"):
        try:
            from services.sympy_validator import validate_answer, _extract_final_answer
            final_ans = _extract_final_answer(ocr_text)
            if final_ans:
                validation = validate_answer(final_ans, correct_answer, subject)
                sympy_info = {"sympy_validation": validation}
                # Si SymPy dice correcto pero IA dio 0 → subir a 70% del máximo
                if validation.get("is_correct") and capped_score < max_points * 0.3:
                    capped_score = round(max_points * 0.7 * 4) / 4
                    sympy_info["sympy_note"] = f"SymPy verificó resultado correcto, puntaje ajustado a {capped_score}"
                # Si SymPy dice incorrecto pero IA dio puntaje completo → bajar a 50%
                elif validation.get("is_correct") is False and capped_score >= max_points:
                    capped_score = round(max_points * 0.5 * 4) / 4
                    sympy_info["sympy_note"] = f"SymPy detectó resultado incorrecto, puntaje ajustado a {capped_score}"
        except Exception as e:
            sympy_info = {"sympy_error": str(e)}

    warnings = state.get("warnings") or []
    if capped_score != ai_score:
        warnings = warnings + [
            f"Puntaje ajustado: IA sugirió {ai_score}, límite oficial es {max_points}"
        ]
    if sympy_info.get("sympy_note"):
        warnings = warnings + [sympy_info["sympy_note"]]

    return {**state, "final_score": capped_score, "warnings": warnings, **sympy_info}


def node_decide_review(state: CorrectionState) -> CorrectionState:
    """Decide si el caso requiere revisión manual docente."""
    if state.get("error") or state.get("review_status") == "manual_required":
        return {**state, "review_status": "manual_required"}

    reasons_for_review = []
    confidence = state.get("ocr_confidence", 0)

    if confidence < 0.55:
        reasons_for_review.append("confianza OCR baja")
    if not state.get("math_steps") and state["subject"] == "math":
        reasons_for_review.append("no se detectaron pasos de desarrollo")
    if state.get("ai_score") is None:
        reasons_for_review.append("evaluador IA no produjo puntaje")

    if reasons_for_review:
        warnings = (state.get("warnings") or []) + [
            f"Marcado para revisión: {', '.join(reasons_for_review)}"
        ]
        return {**state, "review_status": "needs_review", "warnings": warnings}

    return {**state, "review_status": "auto"}


def node_flag_for_manual_review(state: CorrectionState) -> CorrectionState:
    """Nodo de bypass: registra casos que van directo a revisión manual."""
    logger.info(f"[Review] q={state['question_id']} → manual_required")
    return {**state, "review_status": "manual_required"}


def node_finalize_result(state: CorrectionState) -> CorrectionState:
    """Último nodo: prepara el resultado final para guardarlo en Supabase."""
    logger.info(
        f"[Final] q={state['question_id']} | "
        f"score={state.get('final_score')} | "
        f"status={state.get('review_status')}"
    )
    return state


# ─── EDGES ────────────────────────────────────────────────────────────────────

def route_after_ocr(state: CorrectionState) -> str:
    if state.get("error") or state.get("review_status") == "manual_required":
        return "flag_for_manual_review"
    return "parse_response"


def route_after_decide(state: CorrectionState) -> str:
    if state.get("review_status") == "manual_required":
        return "flag_for_manual_review"
    return "finalize_result"


# ─── GRAFO ────────────────────────────────────────────────────────────────────

def build_correction_graph():
    graph = StateGraph(CorrectionState)

    graph.add_node("ocr_extract", node_ocr_extract)
    graph.add_node("parse_response", node_parse_response)
    graph.add_node("evaluate_with_rubric", node_evaluate_with_rubric)
    graph.add_node("apply_rubric_limits", node_apply_rubric_limits)
    graph.add_node("decide_review", node_decide_review)
    graph.add_node("flag_for_manual_review", node_flag_for_manual_review)
    graph.add_node("finalize_result", node_finalize_result)

    graph.set_entry_point("ocr_extract")

    graph.add_conditional_edges("ocr_extract", route_after_ocr, {
        "parse_response": "parse_response",
        "flag_for_manual_review": "flag_for_manual_review"
    })

    graph.add_edge("parse_response", "evaluate_with_rubric")
    graph.add_edge("evaluate_with_rubric", "apply_rubric_limits")
    graph.add_edge("apply_rubric_limits", "decide_review")

    graph.add_conditional_edges("decide_review", route_after_decide, {
        "finalize_result": "finalize_result",
        "flag_for_manual_review": "flag_for_manual_review"
    })

    graph.add_edge("flag_for_manual_review", "finalize_result")
    graph.add_edge("finalize_result", END)

    return graph.compile()


# ─── PROMPTS ──────────────────────────────────────────────────────────────────

PROMPT_GENERAL = """
Eres un asistente de corrección escolar chileno experto.

REGLAS OBLIGATORIAS:
1. Respeta SIEMPRE el puntaje máximo oficial del ejercicio. No puedes superarlo.
2. No inventes errores. Solo reporta lo que ves en la respuesta del estudiante.
3. Analiza el PROCEDIMIENTO, no solo el resultado final.
4. Si la respuesta es ilegible, indica confidence baja.
5. Devuelve SOLO JSON válido, sin texto adicional.
"""

PROMPT_MATH = """
EVALUACIÓN MATEMÁTICA — criterios específicos:
- Desarrollo completo y correcto → puntaje máximo
- Error solo en cálculo final → descuento pequeño (0.25 pts)
- Solo resultado sin desarrollo → máximo 25% del puntaje
- Error conceptual grave → 0 o mínimo
- Operaciones correctas con error de signo → descuento moderado
- Fracciones: verificar equivalencia, no solo forma
"""

PROMPT_LANGUAGE = """
EVALUACIÓN LENGUAJE — criterios específicos:
- Coherencia y cohesión del texto
- Ortografía: descuento progresivo según cantidad de errores
- Estructura (intro, desarrollo, conclusión si corresponde)
- Adecuación al tipo de texto pedido
"""

SUBJECT_PROMPTS = {
    "math": PROMPT_MATH,
    "language": PROMPT_LANGUAGE,
    "science": "Evalúa uso de vocabulario científico, explicación de causas y efectos, precisión conceptual.",
    "history": "Evalúa contextualización histórica, argumentación, uso de fuentes si corresponde.",
}

EVALUATION_OUTPUT_FORMAT = """
Devuelve SOLO este JSON (sin backticks, sin comentarios):
{
  "score": <número entre 0 y max_points>,
  "errors": ["error 1", "error 2"],
  "procedure_evaluation": "<descripción breve del desarrollo>",
  "student_feedback": "<retroalimentación en lenguaje simple para el estudiante>",
  "teacher_note": "<nota técnica para el docente>",
  "confidence": <número entre 0 y 1>
}
"""


def _build_evaluation_prompt(state: CorrectionState) -> str:
    subject_prompt = SUBJECT_PROMPTS.get(state["subject"], "")
    rubric_text = json.dumps(state.get("rubric", {}), ensure_ascii=False, indent=2)

    steps_text = ""
    if state.get("math_steps"):
        steps_text = "\nPasos detectados:\n" + "\n".join(state["math_steps"])

    return f"""
{PROMPT_GENERAL}

{subject_prompt}

EJERCICIO OFICIAL:
{state.get('question_statement', 'No disponible')}

PUNTAJE MÁXIMO: {state.get('max_points', 0)} puntos

RÚBRICA:
{rubric_text}

RESPUESTA DEL ESTUDIANTE (vía OCR):
{state.get('ocr_text', 'Sin texto detectado')}
{steps_text}

{EVALUATION_OUTPUT_FORMAT}
""".strip()


def _parse_ai_evaluation(raw: str) -> dict:
    """Parsea la respuesta JSON del agente evaluador."""
    import re

    raw = raw.strip()

    # Extraer JSON si viene envuelto
    json_match = re.search(r'\{[\s\S]+\}', raw)
    if json_match:
        raw = json_match.group(0)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(f"[Parser] JSON inválido del evaluador: {raw[:200]}")
        return {
            "score": None,
            "errors": ["Error al parsear respuesta IA"],
            "student_feedback": "No disponible",
            "teacher_note": "Error de parsing en el evaluador IA",
            "confidence": 0.0
        }
