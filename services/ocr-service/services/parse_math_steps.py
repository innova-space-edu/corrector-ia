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

    final_patterns = [
        r'(?:resultado|respuesta|r:|r=)[:\s]*([^\n]+)',
        r'(?:por lo tanto|therefore|∴)\s*[:\s]*(.+)',
        r'=\s*([\d\.,/]+)\s*$',
        r'(?:la respuesta es|the answer is)[:\s]*(.+)',
    ]

    step_patterns = [
        r'^\d+[\.\)]\s+(.+)',
        r'^paso\s+\d+[:\s]+(.+)',
        r'^=\s+(.+)',
        r'^[→➜⟹]\s*(.+)',
    ]

    math_operators = re.compile(r'[\+\-\×÷\*/=<>≤≥±√∫∑]')

    for line in lines:
        for pattern in final_patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                final_answer = match.group(1).strip()
                break

        is_step = False
        for pattern in step_patterns:
            if re.match(pattern, line, re.IGNORECASE):
                is_step = True
                break

        if math_operators.search(line) and len(line) > 2:
            is_step = True

        if is_step and line not in steps:
            steps.append(line)

    if not final_answer and steps:
        last = steps[-1]
        eq_match = re.search(r'=\s*([\d\.,/\s]+)$', last)
        if eq_match:
            final_answer = eq_match.group(1).strip()

    return steps, final_answer
