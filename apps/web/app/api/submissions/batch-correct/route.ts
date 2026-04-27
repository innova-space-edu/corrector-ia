// app/api/submissions/batch-correct/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

type PageRow = {
  id: string
  submission_id: string
  student_id: string
  question_id: string
  image_path: string
}

type QuestionInfo = {
  question_type: string
  max_points: number
  statement: string
  alternatives?: { label: string; text: string }[]
  correct_answer?: string | null
}

type ResultRow = { pageId: string; status: "ok" | "error"; error?: string }

export async function POST(req: NextRequest) {
  try {
    const { assessmentId } = await req.json()
    if (!assessmentId) {
      return NextResponse.json({ error: "Falta assessmentId" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: assessment } = await supabase
      .from("assessments")
      .select("official_test_json, answer_key_json, subject, passing_percentage")
      .eq("id", assessmentId)
      .single()

    if (!assessment) {
      return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 })
    }

    const structure = assessment.official_test_json as {
      items?: {
        questions?: {
          question_id: string
          question_type?: string
          max_points?: number
          statement?: string
          alternatives?: { label: string; text: string }[]
        }[]
      }[]
    } | null

    const answerKey = (assessment.answer_key_json ?? {}) as Record<string, string>
    const subject = (assessment.subject ?? "math") as string

    const questionMap: Record<string, QuestionInfo> = {}
    for (const item of structure?.items ?? []) {
      for (const q of item.questions ?? []) {
        questionMap[q.question_id] = {
          question_type: q.question_type ?? "development",
          max_points: q.max_points ?? 2,
          statement: q.statement ?? "",
          alternatives: q.alternatives ?? [],
          correct_answer: answerKey[q.question_id] ?? null,
        }
      }
    }

    const { data: rawPages } = await supabase
      .from("submission_pages")
      .select("id, submission_id, student_id, question_id, image_path")
      .eq("assessment_id", assessmentId)
      .eq("ocr_status", "pending")

    const pages = (rawPages ?? []) as PageRow[]

    if (!pages.length) {
      return NextResponse.json({ ok: true, message: "No hay ejercicios pendientes", corrected: 0 })
    }

    const BATCH_SIZE = 5
    const results: ResultRow[] = []
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://corrector-ia-beryl.vercel.app"

    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (page: PageRow) => {
          try {
            const q = questionMap[page.question_id]
            if (!q) {
              results.push({ pageId: page.id, status: "error", error: "Pregunta no en estructura" })
              return
            }

            const { data: signed } = await supabase.storage
              .from("submission-images")
              .createSignedUrl(page.image_path, 3600)

            if (!signed?.signedUrl) {
              results.push({ pageId: page.id, status: "error", error: "Sin URL de imagen" })
              return
            }

            const res = await fetch(`${appUrl}/api/correct/smart`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                submissionId: page.submission_id,
                assessmentId,
                studentId: page.student_id,
                questionId: page.question_id,
                imageUrl: signed.signedUrl,
                questionType: q.question_type,
                maxPoints: q.max_points,
                questionStatement: q.statement,
                alternatives: q.alternatives,
                correctAnswer: q.correct_answer ?? null,
                subject,
                rubric: {},
              }),
              signal: AbortSignal.timeout(90_000),
            })

            if (res.ok) {
              await supabase
                .from("submission_pages")
                .update({ ocr_status: "done" })
                .eq("id", page.id)
              results.push({ pageId: page.id, status: "ok" })
            } else {
              const err = await res.json()
              results.push({ pageId: page.id, status: "error", error: err.error })
            }
          } catch (e) {
            results.push({ pageId: page.id, status: "error", error: String(e) })
          }
        })
      )

      if (i + BATCH_SIZE < pages.length) {
        await new Promise((r) => setTimeout(r, 1500))
      }
    }

    const submissionIds = [...new Set(pages.map((p: PageRow) => p.submission_id))]
    for (const subId of submissionIds) {
      await fetch(`${appUrl}/api/submissions/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: subId }),
      }).catch(() => {})
    }

    const ok = results.filter((r) => r.status === "ok").length
    const errors = results.filter((r) => r.status === "error").length

    return NextResponse.json({
      ok: true,
      total: pages.length,
      corrected: ok,
      errors,
      submissions: submissionIds.length,
    })
  } catch (e) {
    console.error("[batch-correct]", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
