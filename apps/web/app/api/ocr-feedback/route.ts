// app/api/ocr-feedback/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

// POST — guardar corrección del docente (aprendizaje adaptativo)
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", user.id)
      .single()

    const body = await req.json()
    const {
      submissionId,
      questionId,
      studentId,
      imageUrl,
      ocrText,
      correctedText,
      errorType,
      ocrProvider,
      confidenceAtTime,
      subject,
    } = body

    if (!submissionId || !ocrText || !correctedText) {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 })
    }

    const { error } = await supabase.from("ocr_feedback").insert({
      submission_id: submissionId,
      student_id: studentId,
      question_id: questionId,
      image_url: imageUrl,
      ocr_text: ocrText,
      corrected_text: correctedText,
      error_type: errorType ?? "otro",
      ocr_provider: ocrProvider,
      confidence_at_time: confidenceAtTime,
      subject,
      corrected_by: teacher?.id,
      corrected_at: new Date().toISOString(),
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// GET — obtener patrones de error frecuentes (para el sistema adaptativo)
export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const subject = searchParams.get("subject")
  const studentId = searchParams.get("studentId")

  let query = supabase
    .from("ocr_feedback")
    .select("ocr_text, corrected_text, error_type, subject, created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (subject) query = query.eq("subject", subject)
  if (studentId) query = query.eq("student_id", studentId)

  const { data } = await query
  return NextResponse.json({ feedback: data ?? [] })
}
