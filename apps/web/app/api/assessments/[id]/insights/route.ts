// app/api/assessments/[id]/insights/route.ts

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { callAI } from "@/lib/ai/ai-router"

export const runtime = "nodejs"

type SubmissionRow = {
  final_grade: number | null
  total_score: number | null
  max_score: number | null
  percentage: number | null
  grading_status: string | null
}

type ResultRow = {
  question_id: string
  score: number | null
  max_score: number | null
  errors_detected: string[] | null
  ocr_confidence: number | null
  review_status: string | null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: assessmentId } = await params
  const supabase = createAdminClient()

  // 1. Datos
  const { data: results } = await supabase
    .from("grading_results")
    .select("question_id, score, max_score, errors_detected, ocr_confidence, review_status")
    .eq("assessment_id", assessmentId)

  const { data: submissions } = await supabase
    .from("submissions")
    .select("final_grade, total_score, max_score, percentage, grading_status")
    .eq("assessment_id", assessmentId)

  const { data: assessment } = await supabase
    .from("assessments")
    .select("title, subject, grade_level, total_points")
    .eq("id", assessmentId)
    .single()

  if (!results?.length || !submissions?.length) {
    return NextResponse.json(
      { error: "No hay datos suficientes para generar insights" },
      { status: 422 }
    )
  }

  const typedResults = results as ResultRow[]
  const typedSubmissions = submissions as SubmissionRow[]

  // 2. Estadísticas
  const graded = typedSubmissions.filter((s: SubmissionRow) => s.final_grade !== null)
  const grades = graded.map((s: SubmissionRow) => s.final_grade ?? 0)

  const avgGrade =
    grades.reduce((a: number, b: number) => a + b, 0) / grades.length

  const passRate =
    (grades.filter((g: number) => g >= 4).length / grades.length) * 100

  const byQuestion: Record<string, { scores: number[]; errors: string[] }> = {}

  for (const r of typedResults) {
    if (!byQuestion[r.question_id]) {
      byQuestion[r.question_id] = { scores: [], errors: [] }
    }

    if (r.score != null) {
      byQuestion[r.question_id].scores.push(r.score / (r.max_score || 1))
    }

    if (r.errors_detected) {
      byQuestion[r.question_id].errors.push(...r.errors_detected)
    }
  }

  const questionStats = Object.entries(byQuestion).map(([qid, data]) => ({
    question_id: qid,
    avg_pct: data.scores.length
      ? Math.round(
          (data.scores.reduce((a: number, b: number) => a + b, 0) /
            data.scores.length) *
            100
        )
      : null,
    top_errors: [...new Set(data.errors)].slice(0, 3),
  }))

  const hardest = [...questionStats]
    .filter((q) => q.avg_pct !== null)
    .sort((a, b) => (a.avg_pct ?? 100) - (b.avg_pct ?? 100))
    .slice(0, 3)

  const allErrors = typedResults.flatMap(
    (r: ResultRow) => r.errors_detected ?? []
  )

  const errorFreq: Record<string, number> = {}

  for (const e of allErrors) {
    errorFreq[e] = (errorFreq[e] ?? 0) + 1
  }

  const commonErrors = Object.entries(errorFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e, count]) => ({ error: e, count }))

  // 3. IA
  const prompt = `
Eres un asistente pedagógico experto. Analiza los resultados de esta evaluación escolar chilena y entrega un análisis breve y útil.

Evaluación: ${assessment?.title} (${assessment?.subject}, ${assessment?.grade_level})
Promedio: ${avgGrade.toFixed(1)}
Aprobación: ${passRate.toFixed(0)}%

Preguntas difíciles:
${hardest.map((q) => `- ${q.question_id}: ${q.avg_pct}%`).join("\n")}

Errores frecuentes:
${commonErrors.map((e) => `- ${e.error}`).join("\n")}

Responde en JSON:
{
  "resumen": "",
  "fortalezas": [],
  "debilidades": [],
  "temas_reforzar": [],
  "sugerencia_clase": "",
  "estudiantes_riesgo_pct": 0
}
`

  let aiAnalysis = null

  try {
    const aiResult = await callAI({
      prompt,
      task: "generate_insights",
      maxTokens: 800,
      temperature: 0.3,
    })

    const clean = aiResult.content.replace(/```json|```/g, "").trim()
    const match = clean.match(/\{[\s\S]+\}/)

    if (match) aiAnalysis = JSON.parse(match[0])
  } catch (e) {
    console.error("[insights] AI error:", e)
  }

  // 4. Guardar
  const insightData = {
    assessment_id: assessmentId,
    total_students: submissions.length,
    graded_count: graded.length,
    avg_grade: Math.round(avgGrade * 10) / 10,
    pass_rate: Math.round(passRate * 10) / 10,
    top_score: Math.max(...grades),
    lowest_score: Math.min(...grades),
    hardest_questions: hardest,
    common_errors: commonErrors,
    topics_to_reinforce: aiAnalysis?.temas_reforzar ?? [],
    ai_analysis: aiAnalysis?.resumen ?? null,
    ai_suggestions: aiAnalysis?.sugerencia_clase ?? null,
    generated_at: new Date().toISOString(),
  }

  await supabase
    .from("class_insights")
    .upsert(insightData, { onConflict: "assessment_id" })

  return NextResponse.json({
    ok: true,
    stats: {
      avgGrade: insightData.avg_grade,
      passRate: insightData.pass_rate,
      graded: graded.length,
    },
    hardest,
    commonErrors,
    aiAnalysis,
  })
}
