// app/api/admin/delete/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function DELETE(req: NextRequest) {
  const { resource, id } = await req.json()

  const supabase = createAdminClient()

  // Verificar que el usuario tiene permisos (es el dueño O es admin)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data: teacher } = await supabase
    .from("teachers")
    .select("id, role")
    .eq("user_id", user.id)
    .single()

  if (!teacher) return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

  const isAdmin = ["admin", "superadmin"].includes(teacher.role ?? "")

  if (resource === "assessment") {
    // Verificar dueño
    const { data: assessment } = await supabase
      .from("assessments")
      .select("id, teacher_id, official_pdf_path")
      .eq("id", id)
      .single()

    if (!assessment) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
    if (assessment.teacher_id !== teacher.id && !isAdmin) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    // Eliminar PDF del storage
    if (assessment.official_pdf_path) {
      await supabase.storage.from("assessment-assets").remove([assessment.official_pdf_path])
    }

    // Eliminar imágenes de submissions
    const { data: submissions } = await supabase
      .from("submissions")
      .select("id")
      .eq("assessment_id", id)

    if (submissions?.length) {
      for (const sub of submissions) {
        const { data: pages } = await supabase
          .from("submission_pages")
          .select("image_path")
          .eq("submission_id", sub.id)

        if (pages?.length) {
          const paths = pages.map(p => p.image_path).filter(Boolean)
          if (paths.length) {
            await supabase.storage.from("submission-images").remove(paths)
          }
        }
      }
    }

    // Eliminar en cascada (submissions, grading_results, etc. por FK ON DELETE CASCADE)
    const { error } = await supabase.from("assessments").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: "assessment" })
  }

  if (resource === "library_exam") {
    if (!isAdmin) return NextResponse.json({ error: "Solo admins pueden eliminar de la biblioteca" }, { status: 403 })

    const { data: exam } = await supabase.from("library_exams").select("pdf_path").eq("id", id).single()
    if (exam?.pdf_path) {
      await supabase.storage.from("library-pdfs").remove([exam.pdf_path])
    }
    const { error } = await supabase.from("library_exams").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: "library_exam" })
  }

  if (resource === "submission") {
    const { error } = await supabase.from("submissions").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: "submission" })
  }

  return NextResponse.json({ error: "Recurso no válido" }, { status: 400 })
}
