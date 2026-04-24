"""
quality_check.py — Evalúa calidad de imagen para OCR
"""

import numpy as np
from PIL import Image


def check_image_quality(image: Image.Image) -> float:
    """
    Retorna score 0.0 - 1.0 basado en:
    - Nitidez (blur detection)
    - Contraste
    - Resolución suficiente
    """
    scores = []

    # 1. Nitidez (Laplacian variance)
    gray = np.array(image.convert("L"), dtype=float)
    laplacian_var = _laplacian_variance(gray)
    sharpness_score = min(laplacian_var / 500.0, 1.0)
    scores.append(sharpness_score)

    # 2. Contraste
    std = gray.std()
    contrast_score = min(std / 60.0, 1.0)
    scores.append(contrast_score)

    # 3. Resolución (mínimo 400x300 para OCR decente)
    w, h = image.size
    min_dim = min(w, h)
    resolution_score = min(min_dim / 400.0, 1.0)
    scores.append(resolution_score)

    # 4. Iluminación uniforme
    mean_brightness = gray.mean()
    brightness_ok = 1.0 if 40 < mean_brightness < 220 else 0.4
    scores.append(brightness_ok)

    # Promedio ponderado
    weights = [0.4, 0.3, 0.2, 0.1]
    final_score = sum(s * w for s, w in zip(scores, weights))
    return round(final_score, 3)


def _laplacian_variance(gray: np.ndarray) -> float:
    """Mide nitidez mediante varianza del Laplaciano."""
    try:
        import cv2
        laplacian = cv2.Laplacian(gray.astype(np.uint8), cv2.CV_64F)
        return laplacian.var()
    except ImportError:
        # Fallback sin cv2: usar convolución numpy
        kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=float)
        from scipy.ndimage import convolve
        filtered = convolve(gray, kernel)
        return filtered.var()
    except Exception:
        return 100.0  # Asumir calidad media si falla


# ─────────────────────────────────────────────────────────────────────────────


"""
parse_math_steps.py — Extrae pasos y resultado final del texto OCR
"""

import re
from typing import Optional


def parse_math_response(text: str) -> tuple[list[str], Optional[str]]:
    """
    Dado texto OCR de un ejercicio de matemática:
    - Detecta pasos del desarrollo
    - Extrae el resultado final
    Retorna: (lista_de_pasos, respuesta_final)
    """
    if not text or len(text.strip()) < 3:
        return [], None

    lines = [l.strip() for l in text.split("\n") if l.strip()]

    steps = []
    final_answer = None

    # Patrones de resultado final
    final_patterns = [
        r'(?:resultado|respuesta|r:|r=|=\s*)[:\s]*([^\n]+)',
        r'(?:por lo tanto|therefore|∴)\s*[:\s]*(.+)',
        r'=\s*([\d\.,/]+)\s*$',
        r'(?:la respuesta es|the answer is)[:\s]*(.+)',
    ]

    # Patrones de pasos
    step_patterns = [
        r'^\d+[\.\)]\s+(.+)',              # "1. paso"
        r'^paso\s+\d+[:\s]+(.+)',           # "Paso 1: ..."
        r'^=\s+(.+)',                        # "= ..."
        r'^[→➜⟹]\s*(.+)',                  # flecha como paso
    ]

    # Operadores matemáticos como indicadores de pasos
    math_operators = re.compile(r'[\+\-\×÷\*/=<>≤≥±√∫∑]')

    for line in lines:
        # Detectar resultado final
        for pattern in final_patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                final_answer = match.group(1).strip()
                break

        # Detectar paso del desarrollo
        is_step = False
        for pattern in step_patterns:
            if re.match(pattern, line, re.IGNORECASE):
                is_step = True
                break

        # Si la línea contiene operadores matemáticos también es un paso
        if math_operators.search(line) and len(line) > 2:
            is_step = True

        if is_step and line not in steps:
            steps.append(line)

    # Si no encontramos resultado pero hay steps, el último puede ser el resultado
    if not final_answer and steps:
        last = steps[-1]
        # Buscar el resultado en el último paso
        eq_match = re.search(r'=\s*([\d\.,/\s]+)$', last)
        if eq_match:
            final_answer = eq_match.group(1).strip()

    return steps, final_answer


# ─────────────────────────────────────────────────────────────────────────────


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
    Este score determina si el caso va a revisión automática o manual.

    Retorna float 0.0 - 1.0:
    - > 0.75 → corrección automática confiable
    - 0.4 - 0.75 → corregir pero marcar para revisión
    - < 0.4 → enviar directamente a revisión manual
    """

    # Pesos según asignatura
    weights = {
        "math": {"ocr": 0.4, "quality": 0.35, "structure": 0.25},
        "language": {"ocr": 0.5, "quality": 0.35, "structure": 0.15},
        "science": {"ocr": 0.45, "quality": 0.35, "structure": 0.20},
        "history": {"ocr": 0.5, "quality": 0.35, "structure": 0.15},
    }

    w = weights.get(subject, weights["math"])

    # Score de estructura (¿detectamos pasos?)
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
