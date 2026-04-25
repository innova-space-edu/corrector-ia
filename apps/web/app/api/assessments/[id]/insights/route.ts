// app/api/assessments/[id]/insights/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { callAI } from "@/lib/ai/ai-router"

export const runtime = "nodejs"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: assessmentId } = await params
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
    return NextResponse.json(
      { error: "No hay datos suficientes para generar insights" },
      { status: 422 }
    )
  }

  // 2. Calcular estadísticas
  const graded = submissions.filter((s) => s.final_grade !== null)
  const grades = graded.map((s) => s.final_grade ?? 0)
  const avgGrade = grades.reduce((a, b) => a + b, 0) / grades.length
  const passRate = (grades.filter((g) => g >= 4).length / grades.length) * 100

  const byQuestion: Record<string, { scores: number[]; errors: string[] }> = {}

  for (const r of results) {
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
          (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100
        )
      : null,
    top_errors: [...new Set(data.errors)].slice(0, 3),
  }))

  const hardest = [...questionStats]
    .filter((q) => q.avg_pct !== null)
    .sort((a, b) => (a.avg_pct ?? 100) - (b.avg_pct ?? 100))
    .slice(0, 3)

  const allErrors = results.flatMap((r) => r.errors_detected ?? [])
  const errorFreq: Record<string, number> = {}

  for (const e of allErrors) {
    errorFreq[e] = (errorFreq[e] ?? 0) + 1
  }

  const commonErrors = Object.entries(errorFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e, count]) => ({ error: e, count }))

  // 3. IA
  const prompt = `Eres un asistente pedagógico experto...`

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

    if (match) {
      aiAnalysis = JSON.parse(match[0])
    }
  } catch (e) {
    console.error("[insights] AI analysis failed:", e)
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
