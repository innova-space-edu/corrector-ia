// app/api/submissions/finalize/route.ts

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

type GradingResultRow = {
  score: number | null
  max_score: number | null
  teacher_override_score: number | null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { submissionId } = body

    if (!submissionId) {
      return NextResponse.json(
        { error: "Falta submissionId" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // 1. Obtener resultados de la corrección
    const { data: results, error } = await supabase
      .from("grading_results")
      .select("score, max_score, teacher_override_score")
      .eq("submission_id", submissionId)

    if (error || !results) {
      return NextResponse.json(
        { error: "No se pudieron obtener resultados" },
        { status: 500 }
      )
    }

    const typedResults = results as GradingResultRow[]

    // 2. Calcular puntaje total
    const totalScore = typedResults.reduce(
      (sum: number, r: GradingResultRow) => {
        const s = r.teacher_override_score ?? r.score ?? 0
        return sum + s
      },
      0
    )

    const maxScore = typedResults.reduce(
      (sum: number, r: GradingResultRow) => {
        return sum + (r.max_score ?? 0)
      },
      0
    )

    if (maxScore === 0) {
      return NextResponse.json(
        { error: "Max score inválido" },
        { status: 400 }
      )
    }

    const percentage = totalScore / maxScore

    // Escala chilena 1.0 a 7.0 con exigencia 60%
    const EXIGENCIA = 0.6

    let finalGrade: number

    if (percentage >= EXIGENCIA) {
      finalGrade = ((percentage - EXIGENCIA) / (1 - EXIGENCIA)) * 4 + 4
    } else {
      finalGrade = (percentage / EXIGENCIA) * 3 + 1
    }

    finalGrade = Math.round(finalGrade * 10) / 10
    finalGrade = Math.min(7.0, Math.max(1.0, finalGrade))

    // 3. Guardar resultados en submissions
    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        total_score: totalScore,
        max_score: maxScore,
        percentage: Math.round(percentage * 100),
        final_grade: finalGrade,
        grading_status: "completed",
        graded_at: new Date().toISOString(),
      })
      .eq("id", submissionId)

    if (updateError) {
      return NextResponse.json(
        { error: "Error al actualizar submission" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      submissionId,
      totalScore,
      maxScore,
      percentage: Math.round(percentage * 100),
      finalGrade,
    })
  } catch (error) {
    console.error("[finalize] error:", error)

    return NextResponse.json(
      { error: "Error interno al finalizar corrección" },
      { status: 500 }
    )
  }
}
