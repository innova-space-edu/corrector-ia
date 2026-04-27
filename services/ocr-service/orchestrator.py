"""
orchestrator.py (fragmento relevante)

Integración de SymPy en el pipeline de corrección de desarrollo.
Después de que la IA asigna puntaje, SymPy verifica el resultado numérico
como capa adicional de validación.
"""

import logging
from services.sympy_validator import validate_answer

logger = logging.getLogger(__name__)


def apply_sympy_validation(
    ocr_text: str,
    correct_answer: str,
    ai_score: float,
    max_score: float,
    subject: str = "math",
) -> dict:
    """
    Aplica SymPy como validación adicional sobre el resultado del estudiante.
    
    Lógica:
    - Si SymPy dice CORRECTO pero la IA dijo 0 → subir puntaje (la IA se equivocó)
    - Si SymPy dice INCORRECTO pero la IA dio puntaje completo → bajar puntaje
    - Si SymPy es inconcluso → respetar lo que dijo la IA
    - Solo se aplica en matemáticas cuando hay respuesta correcta de referencia
    """
    if not correct_answer or subject not in ("math", "ciencias", "science"):
        return {"adjusted_score": ai_score, "sympy_used": False}

    # Extraer el resultado final del texto OCR
    final_answer = _extract_final_answer(ocr_text)
    if not final_answer:
        return {"adjusted_score": ai_score, "sympy_used": False,
                "reason": "No se detectó resultado final en OCR"}

    validation = validate_answer(final_answer, correct_answer, subject)
    logger.info(f"[SymPy] student={final_answer!r} correct={correct_answer!r} "
                f"→ {validation['is_correct']} ({validation['method']})")

    if validation["is_correct"] is None:
        # SymPy no pudo validar — respetar la IA
        return {
            "adjusted_score": ai_score,
            "sympy_used": True,
            "sympy_method": validation["method"],
            "sympy_inconclusive": True,
        }

    if validation["is_correct"]:
        # Resultado CORRECTO
        # Si la IA dio menos de la mitad del puntaje, subir al mínimo de aprobación
        if ai_score < max_score * 0.5:
            adjusted = max(ai_score, max_score * 0.7)
            return {
                "adjusted_score": adjusted,
                "sympy_used": True,
                "sympy_method": validation["method"],
                "sympy_override": True,
                "sympy_feedback": f"SymPy verificó que el resultado es correcto. "
                                  f"Puntaje ajustado de {ai_score} a {adjusted}.",
            }
        return {
            "adjusted_score": ai_score,
            "sympy_used": True,
            "sympy_method": validation["method"],
            "sympy_confirmed": True,
        }
    else:
        # Resultado INCORRECTO
        # Si la IA dio puntaje completo, bajar levemente
        if ai_score >= max_score:
            adjusted = max_score * 0.5
            return {
                "adjusted_score": adjusted,
                "sympy_used": True,
                "sympy_method": validation["method"],
                "sympy_override": True,
                "sympy_feedback": f"SymPy detectó que el resultado final es incorrecto. "
                                  f"Puntaje ajustado de {ai_score} a {adjusted}.",
            }
        return {
            "adjusted_score": ai_score,
            "sympy_used": True,
            "sympy_method": validation["method"],
            "sympy_confirmed_wrong": True,
        }


def _extract_final_answer(text: str) -> str | None:
    """Extrae el resultado final del texto OCR."""
    import re
    if not text:
        return None

    patterns = [
        r'(?:resultado|respuesta|r:|r\s*=)[:\s]*([^\n]+)',
        r'(?:por lo tanto|therefore|∴)\s*[:\s]*(.+)',
        r'=\s*([\d\.,/$%\s]+)\s*$',
        r'(?:la respuesta es|el valor es)[:\s]*(.+)',
        r'=\s*\$?([\d\.]+(?:,\d{3})*(?:\.\d+)?)\s*$',
    ]
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    # Buscar en cada línea
    for line in reversed(lines):  # Priorizar últimas líneas
        for pat in patterns:
            m = re.search(pat, line, re.IGNORECASE)
            if m:
                return m.group(1).strip()

    # Fallback: última línea que tenga número
    for line in reversed(lines):
        if re.search(r'\d', line) and '=' in line:
            parts = line.split('=')
            return parts[-1].strip()

    return None