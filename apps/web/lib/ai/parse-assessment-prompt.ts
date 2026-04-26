// lib/ai/parse-assessment-prompt.ts

export function buildAssessmentParserPrompt(pdfText: string): string {
  return `
Eres un asistente experto en análisis de evaluaciones escolares chilenas de nivel básico y medio.

Tu tarea es leer el texto extraído de una prueba oficial y convertirlo en un JSON estructurado y completo.

TIPOS DE PREGUNTAS QUE DEBES DETECTAR:

1. SELECCIÓN MÚLTIPLE / ALTERNATIVAS
   - Preguntas con opciones a) b) c) d) e) o A B C D E
   - Captura CADA alternativa completa en el array "alternatives"
   - question_type = "multiple_choice"

2. VERDADERO / FALSO
   - Afirmaciones donde el estudiante marca V o F
   - question_type = "true_false"

3. DESARROLLO / APLICACIÓN
   - Problemas con cálculos, ejercicios con partes a) b) c)
   - Captura el enunciado completo incluyendo sub-partes
   - question_type = "development"

4. COMPLETAR / TÉRMINOS PAREADOS
   - question_type = "fill_blank" o "matching"

REGLAS CRÍTICAS:
- NUNCA cortes el texto de una pregunta. Captura el enunciado COMPLETO.
- Para selección múltiple: captura TODAS las alternativas con su texto completo.
- Para verdadero/falso: captura la afirmación completa tal como aparece.
- Para desarrollo: captura el problema completo incluyendo datos y sub-preguntas a) b) c).
- Si un ítem dice "2 ptos c/u", aplica ese puntaje a CADA pregunta del ítem.
- No inventes preguntas ni puntajes que no estén en el texto.
- Devuelve SOLO JSON válido, SIN backticks, SIN texto adicional.

FORMATO REQUERIDO:
{
  "assessment_title": "título de la prueba",
  "subject": "matemática",
  "grade_level": "4° medio",
  "total_points": 38,
  "grading_rules": ["Ítem I: 2 ptos c/u", "Ítem II: 2 ptos c/u"],
  "items": [
    {
      "item_id": "item_1",
      "label": "Ítem I. Selección Múltiple",
      "item_type": "multiple_choice",
      "points_rule": "2 ptos c/u",
      "instructions": "instrucciones del ítem si las hay",
      "questions": [
        {
          "question_id": "item_1_q1",
          "number": 1,
          "statement": "ENUNCIADO COMPLETO sin cortar nada",
          "question_type": "multiple_choice",
          "max_points": 2,
          "topic": "tema o null",
          "alternatives": [
            { "label": "a", "text": "texto completo alternativa a" },
            { "label": "b", "text": "texto completo alternativa b" },
            { "label": "c", "text": "texto completo alternativa c" },
            { "label": "d", "text": "texto completo alternativa d" },
            { "label": "e", "text": "texto completo alternativa e" }
          ],
          "correct_answer": null,
          "sub_parts": []
        }
      ]
    },
    {
      "item_id": "item_2",
      "label": "Ítem II. Verdadero y Falso",
      "item_type": "true_false",
      "points_rule": "2 ptos c/u",
      "instructions": "justifica si es verdadero o si es falso",
      "questions": [
        {
          "question_id": "item_2_q1",
          "number": 1,
          "statement": "afirmación completa",
          "question_type": "true_false",
          "max_points": 2,
          "topic": null,
          "alternatives": [],
          "correct_answer": null,
          "sub_parts": []
        }
      ]
    },
    {
      "item_id": "item_3",
      "label": "Ítem III. Desarrollo y Aplicación",
      "item_type": "development",
      "points_rule": "4 ptos c/u",
      "instructions": "Debe tener desarrollo con letra legible",
      "questions": [
        {
          "question_id": "item_3_q1",
          "number": 1,
          "statement": "PROBLEMA COMPLETO con todos los datos",
          "question_type": "development",
          "max_points": 4,
          "topic": "porcentajes",
          "alternatives": [],
          "correct_answer": null,
          "sub_parts": ["a) El valor del descuento aplicado.", "b) El precio después del descuento.", "c) El precio final con IVA."]
        }
      ]
    }
  ]
}

TEXTO DE LA PRUEBA (analiza TODO el texto, no omitas nada):
"""
${pdfText}
"""

IMPORTANTE: Captura TODAS las preguntas sin excepción. Si el OCR tiene caracteres raros, infiere el contenido correcto por contexto.
`.trim()
}
