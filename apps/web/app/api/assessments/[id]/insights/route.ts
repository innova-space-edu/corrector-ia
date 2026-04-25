// app/api/assessments/[id]/insights/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { callAI } from "@/lib/ai/ai-router"

export const runtime = "nodejs"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const assessmentId = params.id
  const supabase = createAdminClient()

  // 1. Recopilar todos los resultados de la evaluación
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
    return NextResponse.json({ error: "No hay datos suficientes para generar insights" }, { status: 422 })
  }

  // 2. Calcular estadísticas
  const graded = submissions.filter((s) => s.final_grade !== null)
  const grades = graded.map((s) => s.final_grade ?? 0)
  const avgGrade = grades.reduce((a, b) => a + b, 0) / grades.length
  const passRate = (grades.filter((g) => g >= 4).length / grades.length) * 100

  // Agrupar por question_id
  const byQuestion: Record<string, { scores: number[]; errors: string[] }> = {}
  for (const r of results) {
    if (!byQuestion[r.question_id]) byQuestion[r.question_id] = { scores: [], errors: [] }
    if (r.score != null) byQuestion[r.question_id].scores.push(r.score / (r.max_score || 1))
    if (r.errors_detected) byQuestion[r.question_id].errors.push(...r.errors_detected)
  }

  const questionStats = Object.entries(byQuestion).map(([qid, data]) => ({
    question_id: qid,
    avg_pct: data.scores.length
      ? Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100)
      : null,
    top_errors: [...new Set(data.errors)].slice(0, 3),
  }))

  const hardest = [...questionStats]
    .filter((q) => q.avg_pct !== null)
    .sort((a, b) => (a.avg_pct ?? 100) - (b.avg_pct ?? 100))
    .slice(0, 3)

  const allErrors = results.flatMap((r) => r.errors_detected ?? [])
  const errorFreq: Record<string, number> = {}
  for (const e of allErrors) errorFreq[e] = (errorFreq[e] ?? 0) + 1
  const commonErrors = Object.entries(errorFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e, count]) => ({ error: e, count }))

  // 3. Generar análisis IA
  const prompt = `
Eres un asistente pedagógico experto. Analiza los resultados de esta evaluación escolar chilena y entrega un análisis pedagógico breve y útil para el docente.

Evaluación: ${assessment?.title} (${assessment?.subject}, ${assessment?.grade_level})
Estudiantes evaluados: ${graded.length}
Promedio de notas: ${avgGrade.toFixed(1)} (escala 1-7)
Tasa de aprobación: ${passRate.toFixed(0)}%

Preguntas más difíciles (menor % de logro):
${hardest.map((q) => `- ${q.question_id}: ${q.avg_pct}% de logro`).join("\n")}

Errores más frecuentes:
${commonErrors.map((e) => `- "${e.error}" (${e.count} veces)`).join("\n")}

Responde con JSON válido (sin backticks):
{
  "resumen": "2-3 oraciones sobre el desempeño general",
  "fortalezas": ["fortaleza 1", "fortaleza 2"],
  "debilidades": ["debilidad 1", "debilidad 2"],
  "temas_reforzar": ["tema 1", "tema 2", "tema 3"],
  "sugerencia_clase": "sugerencia concreta de actividad para reforzar",
  "estudiantes_riesgo_pct": número entre 0 y 100
}
`

  let aiAnalysis = null
  try {
    const aiResult = await callAI({ prompt, task: "generate_insights", maxTokens: 800, temperature: 0.3 })
    const clean = aiResult.content.replace(/```json|```/g, "").trim()
    const match = clean.match(/\{[\s\S]+\}/)
    if (match) aiAnalysis = JSON.parse(match[0])
  } catch (e) {
    console.error("[insights] AI analysis failed:", e)
  }

  // 4. Guardar en class_insights
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

  await supabase.from("class_insights").upsert(insightData, { onConflict: "assessment_id" })

  return NextResponse.json({
    ok: true,
    stats: { avgGrade: insightData.avg_grade, passRate: insightData.pass_rate, graded: graded.length },
    hardest,
    commonErrors,
    aiAnalysis,
  })
}
