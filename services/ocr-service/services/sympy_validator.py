"""
services/sympy_validator.py

Validador matemático con SymPy.
Verifica si la respuesta del estudiante es equivalente a la respuesta correcta,
independientemente de cómo esté escrita.

Ejemplos:
  "1/3" == "0.333" == "0.3333..."  → True
  "x^2 + 2x" == "x*(x+2)" == "x**2 + 2*x" → True
  "$125,440" == "125440" → True (ignora formato)
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def clean_number_string(text: str) -> str:
    """Limpia formato de número chileno: $1.234,56 → 1234.56"""
    if not text:
        return text
    # Quitar símbolo de moneda y espacios
    cleaned = re.sub(r'[$%\s]', '', text.strip())
    # Formato chileno: punto como separador de miles, coma como decimal
    # Detectar si hay coma decimal al final (ej: 1.234,56)
    if re.match(r'^\d{1,3}(\.\d{3})*(,\d+)?$', cleaned):
        cleaned = cleaned.replace('.', '').replace(',', '.')
    else:
        # Formato con coma como separador de miles (ej: 1,234.56)
        cleaned = cleaned.replace(',', '')
    return cleaned


def validate_numeric(student_answer: str, correct_answer: str,
                      tolerance: float = 0.01) -> dict:
    """
    Compara dos respuestas numéricas con tolerancia.
    Maneja fracciones, decimales, porcentajes.
    """
    try:
        from sympy import Rational, Float, simplify, N
        from sympy.parsing.sympy_parser import parse_expr

        def parse_value(s: str):
            s = clean_number_string(s)
            # Fracciones tipo 1/3
            if re.match(r'^-?\d+/\d+$', s):
                num, den = s.split('/')
                return Rational(int(num), int(den))
            # Intentar sympy parse
            s = s.replace('^', '**')
            return parse_expr(s, evaluate=True)

        sv = parse_value(student_answer)
        cv = parse_value(correct_answer)

        diff = abs(float(N(sv - cv)))
        correct_val = abs(float(N(cv)))
        # Tolerancia relativa del 1% o absoluta de 0.01
        rel_tol = tolerance * correct_val if correct_val > 0.001 else tolerance

        is_correct = diff <= max(rel_tol, 0.01)

        return {
            "is_correct": is_correct,
            "student_value": float(N(sv)),
            "correct_value": float(N(cv)),
            "difference": diff,
            "method": "numeric",
        }
    except Exception as e:
        logger.debug(f"[SymPy numeric] {e}")
        return {"is_correct": None, "method": "numeric_failed", "error": str(e)}


def validate_algebraic(student_expr: str, correct_expr: str) -> dict:
    """
    Verifica equivalencia algebraica.
    x^2 + 2x == x*(x+2) → True
    """
    try:
        from sympy import simplify, symbols
        from sympy.parsing.sympy_parser import (
            parse_expr, standard_transformations,
            implicit_multiplication_application
        )

        transformations = standard_transformations + (implicit_multiplication_application,)

        def parse_alg(s: str):
            s = s.replace('^', '**').replace('×', '*').replace('÷', '/')
            return parse_expr(s, transformations=transformations, evaluate=True)

        se = parse_alg(student_expr)
        ce = parse_alg(correct_expr)

        diff = simplify(se - ce)
        is_correct = diff == 0

        return {
            "is_correct": is_correct,
            "difference": str(diff),
            "method": "algebraic",
        }
    except Exception as e:
        logger.debug(f"[SymPy algebraic] {e}")
        return {"is_correct": None, "method": "algebraic_failed", "error": str(e)}


def validate_answer(student_answer: str, correct_answer: str,
                    subject: str = "math") -> dict:
    """
    Punto de entrada principal.
    Intenta validación numérica, luego algebraica.
    
    Returns:
        {
            "is_correct": bool | None,
            "confidence": float,
            "method": str,
            "feedback": str
        }
    """
    if not student_answer or not correct_answer:
        return {"is_correct": None, "confidence": 0, "method": "empty",
                "feedback": "Respuesta vacía"}

    sa = student_answer.strip()
    ca = correct_answer.strip()

    # 1. Comparación exacta (normalizada)
    if sa.lower().replace(' ', '') == ca.lower().replace(' ', ''):
        return {"is_correct": True, "confidence": 1.0, "method": "exact",
                "feedback": "Respuesta correcta (coincidencia exacta)"}

    # 2. Intento numérico
    numeric = validate_numeric(sa, ca)
    if numeric["is_correct"] is not None:
        feedback = (
            "✓ Respuesta numérica correcta"
            if numeric["is_correct"]
            else f"Incorrecto. Valor obtenido: {numeric.get('student_value', '?')}, "
                 f"esperado: {numeric.get('correct_value', '?')}"
        )
        return {
            "is_correct": numeric["is_correct"],
            "confidence": 0.95,
            "method": "numeric",
            "feedback": feedback,
            **{k: v for k, v in numeric.items() if k not in ("is_correct", "method")},
        }

    # 3. Intento algebraico
    algebraic = validate_algebraic(sa, ca)
    if algebraic["is_correct"] is not None:
        feedback = (
            "✓ Expresión algebraica equivalente"
            if algebraic["is_correct"]
            else "Expresión algebraica incorrecta"
        )
        return {
            "is_correct": algebraic["is_correct"],
            "confidence": 0.90,
            "method": "algebraic",
            "feedback": feedback,
        }

    # 4. No se pudo validar automáticamente
    return {
        "is_correct": None,
        "confidence": 0,
        "method": "inconclusive",
        "feedback": "No se pudo validar matemáticamente. Requiere revisión del docente.",
    }