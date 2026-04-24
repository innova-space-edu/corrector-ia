"""
merge_confidence.py — Calcula confianza final combinando múltiples señales
"""


def merge_and_score(
    ocr_confidence: float,
    quality_score: float,
    has_math_steps: bool,
    subject: str
) -> float:
    """
    Combina señales para producir un score de confianza final.
    - > 0.75 → corrección automática confiable
    - 0.4 - 0.75 → corregir pero marcar para revisión
    - < 0.4 → enviar directamente a revisión manual
    """
    weights = {
        "math":     {"ocr": 0.4, "quality": 0.35, "structure": 0.25},
        "language": {"ocr": 0.5, "quality": 0.35, "structure": 0.15},
        "science":  {"ocr": 0.45, "quality": 0.35, "structure": 0.20},
        "history":  {"ocr": 0.5, "quality": 0.35, "structure": 0.15},
    }

    w = weights.get(subject, weights["math"])
    structure_score = 0.8 if has_math_steps else 0.4

    final = (
        ocr_confidence * w["ocr"] +
        quality_score * w["quality"] +
        structure_score * w["structure"]
    )

    return round(min(max(final, 0.0), 1.0), 3)


def should_flag_for_review(confidence: float) -> bool:
    """Determina si el resultado debe ir a revisión manual docente."""
    return confidence < 0.55
