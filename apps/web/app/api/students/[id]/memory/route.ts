// app/api/students/[id]/memory/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { callAI, parseAIJson } from "@/lib/ai/ai-router"

export const runtime = "nodejs"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const studentId = params.id
  const supabase = createAdminClient()

  // 1. Recopilar historial de resultados del estudiante
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
    return NextResponse.json({ error: "Sin historial de correcciones para este estudiante" }, { status: 404 })
  }

  // 2. Calcular estadísticas
  const allErrors = results.flatMap(r => r.errors_detected ?? [])
  const errorFreq: Record<string, number> = {}
  for (const e of allErrors) errorFreq[e] = (errorFreq[e] ?? 0) + 1
  const topErrors = Object.entries(errorFreq).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const avgPct = results.reduce((s, r) => s + (r.max_score ? (r.score ?? 0) / r.max_score : 0), 0) / results.length

  // 3. Análisis IA de la memoria del estudiante
  const prompt = `
Eres un asistente pedagógico chileno. Analiza el historial de desempeño de este estudiante.

Estudiante: ${student?.full_name ?? "—"}
Total ejercicios corregidos: ${results.length}
Promedio de logro: ${Math.round(avgPct * 100)}%

Errores más frecuentes:
${topErrors.map(([e, n]) => `- "${e}": ${n} veces`).join("\n")}

Últimas retroalimentaciones:
${results.slice(0, 5).map(r => r.student_feedback).filter(Boolean).join("\n")}

Responde SOLO JSON (sin backticks):
{
  "recurring_errors": ["error1", "error2", "error3"],
  "weak_topics": ["tema débil 1", "tema débil 2"],
  "strong_topics": ["fortaleza 1"],
  "improvement_trend": "mejorando | estable | bajando",
  "teacher_recommendation": "recomendación concreta para el docente"
}
`

  let aiMemory: Record<string, unknown> = {}
  try {
    const result = await callAI({ prompt, task: "generate_insights", maxTokens: 400, temperature: 0.2 })
    aiMemory = parseAIJson(result.content)
  } catch { /* keep empty if AI fails */ }

  // 4. Guardar en student_memory
  await supabase.from("student_memory").upsert({
    student_id: studentId,
    subject: "all",
    recurring_errors: aiMemory.recurring_errors ?? topErrors.map(([e]) => e),
    strong_topics: aiMemory.strong_topics ?? [],
    weak_topics: aiMemory.weak_topics ?? [],
    improvement_trend: aiMemory.improvement_trend ?? "estable",
    last_updated: new Date().toISOString(),
  }, { onConflict: "student_id,subject" })

  return NextResponse.json({
    ok: true,
    studentId,
    studentName: student?.full_name,
    totalExercises: results.length,
    avgPercentage: Math.round(avgPct * 100),
    topErrors,
    aiMemory,
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()

  const [{ data: memory }, { data: student }] = await Promise.all([
    supabase.from("student_memory").select("*").eq("student_id", params.id).single(),
    supabase.from("students").select("full_name").eq("id", params.id).single(),
  ])

  return NextResponse.json({ student, memory })
}
