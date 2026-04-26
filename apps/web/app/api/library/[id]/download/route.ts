// app/api/library/[id]/download/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()

  // Incrementar contador de descargas
  await supabase.rpc("increment_download_count", { exam_id: params.id }).catch(() => {
    // Fallback si no existe la función RPC
    supabase
      .from("library_exams")
      .update({ download_count: supabase.rpc as any })
      .eq("id", params.id)
  })

  // Obtener URL del PDF
  const { data: exam } = await supabase
    .from("library_exams")
    .select("pdf_path, title")
    .eq("id", params.id)
    .single()

  if (!exam) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const { data } = await supabase.storage
    .from("library-pdfs")
    .createSignedUrl(exam.pdf_path, 300)

  return NextResponse.json({ url: data?.signedUrl, title: exam.title })
}
