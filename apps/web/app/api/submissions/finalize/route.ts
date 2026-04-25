// app/api/submissions/finalize/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { calculateChileanGrade } from "@/lib/grades/calculate-grade"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { submissionId } = await req.json()
    if (!submissionId) {
      return NextResponse.json({ error: "Falta submissionId" }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Obtener todos los grading_results del envío
    const { data: results, error } = await supabase
      .from("grading_results")
      .select("score, max_score, teacher_override_score, review_status")
      .eq("submission_id", submissionId)

    if (error || !results?.length) {
      return NextResponse.json({ error: "No hay resultados de corrección" }, { status: 404 })
    }

    // 2. Calcular puntaje total
    // Usar teacher_override_score si existe, sino score de IA
    const totalScore = results.reduce((sum, r) => {
      const s = r.teacher_override_score ?? r.score ?? 0
      return sum + s
    }, 0)

    const maxScore = results.reduce((sum, r) => sum + (r.max_score ?? 0), 0)

    if (maxScore === 0) {
      return NextResponse.json({ error: "Puntaje máximo es 0" }, { status: 422 })
    }

    // 3. Obtener exigencia de la evaluación
    const { data: submission } = await supabase
      .from("submissions")
      .select("assessment_id")
      .eq("id", submissionId)
      .single()

    const { data: assessment } = await supabase
      .from("assessments")
      .select("passing_percentage")
      .eq("id", submission?.assessment_id)
      .single()

    const passingPct = assessment?.passing_percentage ?? 60

    // 4. Calcular nota
    const gradeResult = calculateChileanGrade(totalScore, maxScore, passingPct)

    // 5. Guardar en submissions
    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        total_score: gradeResult.totalScore,
        max_score: gradeResult.maxScore,
        percentage: gradeResult.percentage,
        final_grade: gradeResult.grade,
        grading_status: "completed",
        graded_at: new Date().toISOString(),
      })
      .eq("id", submissionId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, ...gradeResult })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
