// app/api/library/[id]/download/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = createAdminClient()

  // Incrementar contador de descargas
  const { data: exam } = await supabase
    .from("library_exams")
    .select("pdf_path, title, download_count")
    .eq("id", id)
    .single()

  if (!exam) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  // Incrementar contador
  await supabase
    .from("library_exams")
    .update({ download_count: (exam.download_count ?? 0) + 1 })
    .eq("id", id)

  const { data } = await supabase.storage
    .from("library-pdfs")
    .createSignedUrl(exam.pdf_path, 300)

  return NextResponse.json({ url: data?.signedUrl, title: exam.title })
}
