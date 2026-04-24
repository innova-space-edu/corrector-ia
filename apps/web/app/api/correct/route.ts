/**
 * app/api/correct/route.ts
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL!

type GradingResultRow = {
  score: number | null
  max_score: number | null
  review_status: string | null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      submissionId,
      studentId,
      questionId,
      imageUrl,
      subject,
      maxPoints,
      questionStatement,
      rubric,
      assessmentId,
    } = body

    if (!submissionId || !imageUrl || !questionId) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: submissionId, imageUrl, questionId" },
        { status: 400 }
      )
    }

    const orchestratorResponse = await fetch(`${OCR_SERVICE_URL}/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        assessment_id: assessmentId,
        submission_id: submissionId,
        student_id: studentId,
        question_id: questionId,
        subject,
        question_statement: questionStatement,
        max_points: maxPoints,
        rubric: rubric ?? {},
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!orchestratorResponse.ok) {
      const errText = await orchestratorResponse.text()
      console.error("[Correct] Orchestrator error:", errText)
      return NextResponse.json(
        { error: "El servicio de corrección falló", detail: errText },
        { status: 502 }
      )
    }

    const result = await orchestratorResponse.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: insertError } = await supabase.from("grading_results").upsert(
      {
        submission_id: submissionId,
        question_id: questionId,
        student_id: studentId,
        assessment_id: assessmentId,
        ocr_text: result.ocr_text,
        ocr_confidence: result.ocr_confidence,
        ocr_provider: result.ocr_provider,
        score: result.final_score,
        max_score: maxPoints,
        errors_detected: result.ai_errors ?? [],
        student_feedback: result.ai_feedback,
        teacher_note: result.ai_teacher_note,
        raw_model_output: result.ai_raw_output,
        review_status: result.review_status,
        warnings: result.warnings ?? [],
        graded_at: new Date().toISOString(),
      },
      { onConflict: "submission_id,question_id" }
    )

    if (insertError) {
      console.error("[Correct] Supabase insert error:", insertError)
      return NextResponse.json(
        { error: "Error al guardar resultado", detail: insertError.message },
        { status: 500 }
      )
    }

    if (result.review_status === "auto") {
      await _tryCalculateFinalGrade(supabase as any, submissionId, assessmentId)
    }

    return NextResponse.json({
      ok: true,
      questionId,
      score: result.final_score,
      maxPoints,
      reviewStatus: result.review_status,
      feedback: result.ai_feedback,
      warnings: result.warnings,
    })
  } catch (error) {
    console.error("[Correct] Unexpected error:", error)
    return NextResponse.json(
      { error: "Error interno al procesar corrección" },
      { status: 500 }
    )
  }
}

async function _tryCalculateFinalGrade(
  supabase: any,
  submissionId: string,
  assessmentId: string
): Promise<void> {
  try {
    const { data: results, error } = await supabase
      .from("grading_results")
      .select("score, max_score, review_status")
      .eq("submission_id", submissionId)

    if (error || !results) return

    const typedResults = results as GradingResultRow[]

    const allAuto = typedResults.every(
      (r: GradingResultRow) => r.review_status === "auto"
    )

    if (!allAuto) return

    const totalObtained = typedResults.reduce(
      (sum: number, r: GradingResultRow) => sum + (r.score ?? 0),
      0
    )

    const totalMax = typedResults.reduce(
      (sum: number, r: GradingResultRow) => sum + (r.max_score ?? 0),
      0
    )

    if (totalMax === 0) return

    const percentage = totalObtained / totalMax
    const EXIGENCIA = 0.6

    let grade: number

    if (percentage >= EXIGENCIA) {
      grade = ((percentage - EXIGENCIA) / (1 - EXIGENCIA)) * 4 + 4
    } else {
      grade = (percentage / EXIGENCIA) * 3 + 1
    }

    grade = Math.round(grade * 10) / 10
    grade = Math.min(7.0, Math.max(1.0, grade))

    await supabase
      .from("submissions")
      .update({
        total_score: totalObtained,
        max_score: totalMax,
        percentage: Math.round(percentage * 100),
        final_grade: grade,
        grading_status: "completed",
        graded_at: new Date().toISOString(),
      })
      .eq("id", submissionId)

    console.log(
      `[Grade] submission=${submissionId} | ${totalObtained}/${totalMax} → nota ${grade}`
    )
  } catch (e) {
    console.error("[Grade] Error calculando nota:", e)
  }
}
