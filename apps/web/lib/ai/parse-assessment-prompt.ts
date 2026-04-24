// lib/ai/parse-assessment-prompt.ts

export function buildAssessmentParserPrompt(pdfText: string): string {
  return `
Eres un asistente experto en análisis de evaluaciones escolares chilenas.

Tu tarea es leer el texto extraído de una prueba oficial y convertirlo en JSON estructurado.

DEBES IDENTIFICAR:
1. Título de la evaluación
2. Puntaje total de la prueba
3. Ítems o secciones
4. Regla de puntaje por ítem (ej: "2 ptos c/u", "3 puntos cada uno")
5. Ejercicios o preguntas dentro de cada ítem
6. Puntaje máximo real por ejercicio

REGLAS ESTRICTAS:
- No inventes ejercicios ni puntajes que no estén en el texto
- Si un bloque dice "2 ptos c/u", aplica ese valor a CADA ejercicio del bloque
- Si no puedes determinar un dato, usa null
- Devuelve SOLO JSON válido, sin texto adicional, sin backticks

FORMATO REQUERIDO:
{
  "assessment_title": "string o null",
  "total_points": número o null,
  "grading_rules": ["regla 1", "regla 2"],
  "items": [
    {
      "item_id": "item_1",
      "label": "Ítem 1",
      "points_rule": "2 ptos c/u",
      "questions": [
        {
          "question_id": "item_1_q1",
          "statement": "enunciado del ejercicio",
          "max_points": 2,
          "topic": "tema del ejercicio o null"
        }
      ]
    }
  ]
}

TEXTO DE LA PRUEBA:
"""
${pdfText}
"""
`.trim()
}
