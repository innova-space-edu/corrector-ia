// app/api/students/[id]/memory/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { callAI, parseAIJson } from "@/lib/ai/ai-router"

export const runtime = "nodejs"

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await context.params
  const supabase = createAdminClient()

  const { data: results } = await supabase
    .from("grading_results")
    .select("question_id, score, max_score, errors_detected, student_feedback, review_status, graded_at")
    .eq("student_id", studentId)
    .order("graded_at", { ascending: false })
    .limit(100)

  const { data: student } = await supabase
    .from("students")
    .select("full_name")
    .eq("id", studentId)
    .single()

  if (!results?.length) {
    return NextResponse.json({ error: "Sin historial de correcciones" }, { status: 404 })
  }

  const allErrors = results.flatMap(r => r.errors_detected ?? [])
  const errorFreq: Record<string, number> = {}
  for (const e of allErrors) errorFreq[e] = (errorFreq[e] ?? 0) + 1
  const topErrors = Object.entries(errorFreq).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const avgPct = results.reduce((s, r) => s + (r.max_score ? (r.score ?? 0) / r.max_score : 0), 0) / results.length

  const prompt = `
Analiza el historial de desempeño del estudiante ${student?.full_name ?? "—"}.
Total ejercicios: ${results.length}, Promedio: ${Math.round(avgPct * 100)}%
Errores frecuentes: ${topErrors.map(([e, n]) => `"${e}": ${n}x`).join(", ")}

Responde SOLO JSON (sin backticks):
{
  "recurring_errors": ["error1", "error2"],
  "weak_topics": ["tema1", "tema2"],
  "strong_topics": ["fortaleza1"],
  "improvement_trend": "mejorando",
  "teacher_recommendation": "recomendación concreta"
}
`

  let aiMemory: Record<string, unknown> = {}
  try {
    const result = await callAI({ prompt, task: "generate_insights", maxTokens: 400, temperature: 0.2 })
    aiMemory = parseAIJson(result.content)
  } catch { /* keep empty */ }

  await supabase.from("student_memory").upsert({
    student_id: studentId,
    subject: "all",
    recurring_errors: aiMemory.recurring_errors ?? topErrors.map(([e]) => e),
    strong_topics: aiMemory.strong_topics ?? [],
    weak_topics: aiMemory.weak_topics ?? [],
    improvement_trend: aiMemory.improvement_trend ?? "estable",
    last_updated: new Date().toISOString(),
  }, { onConflict: "student_id,subject" })

  return NextResponse.json({ ok: true, studentId, studentName: student?.full_name, totalExercises: results.length, avgPercentage: Math.round(avgPct * 100), topErrors, aiMemory })
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = createAdminClient()
  const [{ data: memory }, { data: student }] = await Promise.all([
    supabase.from("student_memory").select("*").eq("student_id", id).single(),
    supabase.from("students").select("full_name").eq("id", id).single(),
  ])
  return NextResponse.json({ student, memory })
}
