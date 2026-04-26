// app/api/correct/smart/route.ts
/**
 * Corrector inteligente por tipo de pregunta.
 *
 * - multiple_choice: OCR detecta letra marcada → compara con clave → puntaje automático
 * - true_false:      OCR detecta V/F + justificación → IA evalúa justificación
 * - development:     Pipeline completo OCR + IA evaluadora + rúbrica
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { callAI, parseAIJson } from "@/lib/ai/ai-router"

export const runtime = "nodejs"

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL!

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      submissionId, assessmentId, studentId,
      questionId, imageUrl,
      questionType,   // "multiple_choice" | "true_false" | "development"
      maxPoints,
      questionStatement,
      alternatives,   // [{label, text}] para MC
      correctAnswer,  // "d" para MC, "V" o "F" para T/F
      subject,
      rubric,
    } = body

    const supabase = createAdminClient()

    // 1. Obtener imagen con URL firmada si es necesario
    let signedUrl = imageUrl
    if (!imageUrl.startsWith("http")) {
      const { data } = await supabase.storage
        .from("submission-images")
        .createSignedUrl(imageUrl, 3600)
      signedUrl = data?.signedUrl ?? imageUrl
    }

    // 2. Correr OCR base (siempre)
    const ocrResult = await runOCR(signedUrl, subject, questionId)

    let score: number
    let errors: string[] = []
    let feedback: string
    let teacherNote: string
    let confidence: number
    let reviewStatus: string

    // 3. Corregir según tipo de pregunta
    if (questionType === "multiple_choice" && correctAnswer) {
      const result = correctMultipleChoice({
        ocrText: ocrResult.text,
        correctAnswer,
        maxPoints,
        questionStatement,
        alternatives,
      })
      score = result.score
      errors = result.errors
      feedback = result.feedback
      teacherNote = result.teacherNote
      confidence = result.confidence
      reviewStatus = confidence >= 0.8 ? "auto" : "needs_review"

    } else if (questionType === "true_false" && correctAnswer) {
      const result = await correctTrueFalse({
        ocrText: ocrResult.text,
        correctAnswer,
        maxPoints,
        questionStatement,
        subject,
      })
      score = result.score
      errors = result.errors
      feedback = result.feedback
      teacherNote = result.teacherNote
      confidence = result.confidence
      reviewStatus = confidence >= 0.7 ? "auto" : "needs_review"

    } else {
      // development (or fallback)
      const result = await correctDevelopment({
        ocrText: ocrResult.text,
        maxPoints,
        questionStatement,
        subject,
        rubric,
        ocrConfidence: ocrResult.confidence,
      })
      score = result.score
      errors = result.errors
      feedback = result.feedback
      teacherNote = result.teacherNote
      confidence = result.confidence
      reviewStatus = ocrResult.confidence < 0.5 ? "manual_required" : confidence >= 0.7 ? "auto" : "needs_review"
    }

    // 4. Guardar en grading_results
    const { error: dbErr } = await supabase
      .from("grading_results")
      .upsert({
        submission_id: submissionId,
        question_id: questionId,
        student_id: studentId,
        assessment_id: assessmentId,
        ocr_text: ocrResult.text,
        ocr_confidence: ocrResult.confidence,
        ocr_provider: ocrResult.provider,
        score: Math.round(score * 4) / 4,
        max_score: maxPoints,
        errors_detected: errors,
        student_feedback: feedback,
        teacher_note: teacherNote,
        review_status: reviewStatus,
        warnings: ocrResult.warnings ?? [],
        graded_at: new Date().toISOString(),
      }, { onConflict: "submission_id,question_id" })

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      questionId,
      score,
      maxPoints,
      reviewStatus,
      ocrText: ocrResult.text,
      ocrConfidence: ocrResult.confidence,
      feedback,
    })

  } catch (e) {
    console.error("[smart-correct]", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ─── OCR Helper ───────────────────────────────────────────────────────────────

async function runOCR(imageUrl: string, subject: string, questionId: string) {
  try {
    const imgRes = await fetch(imageUrl)
    const imgBuffer = await imgRes.arrayBuffer()

    const formData = new FormData()
    formData.append("file", new Blob([imgBuffer], { type: "image/jpeg" }), "image.jpg")
    formData.append("subject", subject)
    formData.append("question_id", questionId)

    const response = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) throw new Error(`OCR service error: ${response.status}`)
    return await response.json()
  } catch (e) {
    console.warn("[smart-correct] OCR falló:", e)
    return { text: "", confidence: 0.0, provider: "none", warnings: ["OCR service no disponible"] }
  }
}

// ─── Corrector Selección Múltiple ─────────────────────────────────────────────

function correctMultipleChoice(params: {
  ocrText: string
  correctAnswer: string
  maxPoints: number
  questionStatement: string
  alternatives?: { label: string; text: string }[]
}) {
  const { ocrText, correctAnswer, maxPoints } = params
  const text = ocrText.toLowerCase().trim()
  const correct = correctAnswer.toLowerCase()

  // Detectar qué letra marcó el estudiante
  const letterPattern = /\b([a-e])\b|\b([a-e])\)/g
  const matches = [...text.matchAll(letterPattern)]
  const detectedLetters = [...new Set(matches.map(m => (m[1] || m[2]).toLowerCase()))]

  let detectedAnswer: string | null = null
  let confidence = 0.5

  if (detectedLetters.length === 1) {
    detectedAnswer = detectedLetters[0]
    confidence = 0.9
  } else if (detectedLetters.length > 1) {
    // Múltiples letras — baja confianza, tomar la que aparece más
    detectedAnswer = detectedLetters[0]
    confidence = 0.4
  }

  if (!detectedAnswer) {
    return {
      score: 0,
      errors: ["No se detectó letra marcada en la imagen"],
      feedback: "No se pudo leer la alternativa marcada.",
      teacherNote: "OCR no detectó letra. Requiere revisión manual.",
      confidence: 0.2,
    }
  }

  const isCorrect = detectedAnswer === correct
  const score = isCorrect ? maxPoints : 0

  return {
    score,
    errors: isCorrect ? [] : [`Marcó "${detectedAnswer.toUpperCase()}", correcta es "${correct.toUpperCase()}"`],
    feedback: isCorrect
      ? "¡Correcto! Seleccionaste la alternativa correcta."
      : `Incorrecto. Marcaste la alternativa ${detectedAnswer.toUpperCase()}.`,
    teacherNote: `Detectado: ${detectedAnswer.toUpperCase()} | Correcto: ${correct.toUpperCase()} | Confianza OCR: ${Math.round(confidence * 100)}%`,
    confidence,
  }
}

// ─── Corrector Verdadero/Falso ────────────────────────────────────────────────

async function correctTrueFalse(params: {
  ocrText: string
  correctAnswer: string  // "V" o "F"
  maxPoints: number
  questionStatement: string
  subject: string
}) {
  const { ocrText, correctAnswer, maxPoints, questionStatement } = params
  const text = ocrText.toLowerCase().trim()
  const correct = correctAnswer.toUpperCase()

  // Detectar V o F
  let detected: string | null = null
  let confidence = 0.6

  if (/\bv(erdadero)?\b/.test(text) && !/\bf(also)?\b/.test(text)) {
    detected = "V"; confidence = 0.85
  } else if (/\bf(also)?\b/.test(text) && !/\bv(erdadero)?\b/.test(text)) {
    detected = "F"; confidence = 0.85
  } else if (text.startsWith("v")) {
    detected = "V"; confidence = 0.7
  } else if (text.startsWith("f")) {
    detected = "F"; confidence = 0.7
  }

  const isCorrect = detected === correct

  // Si hay texto de justificación, evaluarla con IA
  let justificationScore = 0
  let justificationFeedback = ""
  const hasJustification = ocrText.length > 5

  if (hasJustification && isCorrect) {
    try {
      const prompt = `
Eres un corrector escolar chileno. Evalúa la justificación del estudiante para una pregunta de Verdadero/Falso.

Afirmación: "${questionStatement}"
Respuesta correcta: ${correct}
El estudiante respondió: ${detected} (correcto)
Justificación del estudiante: "${ocrText}"

Evalúa si la justificación es correcta matemática/conceptualmente.
Responde SOLO JSON:
{
  "justification_correct": true/false,
  "feedback": "retroalimentación breve para el estudiante"
}
`
      const result = await callAI({ prompt, task: "evaluate_exercise", maxTokens: 200, temperature: 0.1 })
      const json = parseAIJson<{ justification_correct: boolean; feedback: string }>(result.content)
      justificationFeedback = json.feedback
      justificationScore = json.justification_correct ? maxPoints : maxPoints * 0.5
    } catch {
      justificationScore = isCorrect ? maxPoints : 0
    }
  }

  const score = !detected
    ? 0
    : !isCorrect
    ? 0
    : hasJustification
    ? justificationScore
    : maxPoints

  return {
    score,
    errors: !detected
      ? ["No se detectó V o F"]
      : !isCorrect
      ? [`Respondió ${detected}, correcto es ${correct}`]
      : [],
    feedback: !detected
      ? "No se pudo leer la respuesta."
      : !isCorrect
      ? `Incorrecto. La afirmación es ${correct === "V" ? "Verdadera" : "Falsa"}.`
      : justificationFeedback || "¡Correcto!",
    teacherNote: `Detectado: ${detected ?? "no detectado"} | Correcto: ${correct} | Confianza: ${Math.round(confidence * 100)}%`,
    confidence: detected ? confidence : 0.1,
  }
}

// ─── Corrector Desarrollo ─────────────────────────────────────────────────────

async function correctDevelopment(params: {
  ocrText: string
  maxPoints: number
  questionStatement: string
  subject: string
  rubric?: Record<string, unknown>
  ocrConfidence: number
}) {
  const { ocrText, maxPoints, questionStatement, subject, rubric, ocrConfidence } = params

  if (!ocrText || ocrText.length < 5) {
    return {
      score: 0,
      errors: ["No se detectó texto en la imagen"],
      feedback: "No se pudo leer el desarrollo.",
      teacherNote: "Imagen ilegible o sin respuesta. Requiere revisión manual.",
      confidence: 0.0,
    }
  }

  const subjectPrompts: Record<string, string> = {
    math: "Evalúa el procedimiento matemático paso a paso. Revisa operaciones, signos, resultados. Descuenta por error conceptual, no solo por error aritmético menor.",
    language: "Evalúa coherencia, ortografía, estructura del texto y adecuación al tipo de texto solicitado.",
    science: "Evalúa uso de vocabulario científico, explicación de causas y efectos, precisión conceptual.",
    history: "Evalúa contextualización histórica, argumentación y uso de conceptos históricos.",
  }

  const prompt = `
Eres corrector escolar chileno experto en ${subject}.
${subjectPrompts[subject] ?? ""}

REGLAS:
- Puntaje máximo: ${maxPoints} puntos
- NO inventes errores ni puntajes
- Devuelve SOLO JSON válido

EJERCICIO OFICIAL:
${questionStatement}

RÚBRICA:
${rubric ? JSON.stringify(rubric, null, 2) : "No especificada — usa criterio pedagógico"}

RESPUESTA DEL ESTUDIANTE (OCR):
${ocrText}

JSON esperado (sin backticks):
{
  "score": número entre 0 y ${maxPoints},
  "errors": ["error1", "error2"],
  "procedure_evaluation": "descripción del desarrollo",
  "student_feedback": "retroalimentación para el estudiante",
  "teacher_note": "nota técnica para el docente",
  "confidence": número entre 0 y 1
}
`

  try {
    const result = await callAI({ prompt, task: "evaluate_exercise", maxTokens: 600, temperature: 0.1 })
    const json = parseAIJson<{
      score: number; errors: string[]; student_feedback: string
      teacher_note: string; confidence: number
    }>(result.content)

    // Limitar puntaje al máximo
    const cappedScore = Math.min(Math.max(json.score ?? 0, 0), maxPoints)
    const roundedScore = Math.round(cappedScore * 4) / 4

    return {
      score: roundedScore,
      errors: json.errors ?? [],
      feedback: json.student_feedback ?? "",
      teacherNote: json.teacher_note ?? "",
      confidence: Math.min(json.confidence ?? 0.5, ocrConfidence > 0.3 ? 1 : ocrConfidence),
    }
  } catch (e) {
    return {
      score: 0,
      errors: ["Error en el evaluador IA"],
      feedback: "No se pudo evaluar automáticamente.",
      teacherNote: `Error IA: ${String(e)}. Requiere revisión manual.`,
      confidence: 0.0,
    }
  }
}
