// app/api/admin/delete/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

type DeleteResource = "assessment" | "library_exam" | "submission"

export async function DELETE(req: NextRequest) {
  try {
    const { resource, id } = (await req.json()) as { resource?: DeleteResource; id?: string }

    if (!resource || !id) {
      return NextResponse.json({ error: "Faltan resource o id" }, { status: 400 })
    }

    // IMPORTANTE:
    // createClient() lee las cookies del usuario autenticado.
    // createAdminClient() usa service_role y NO debe usarse para obtener auth.getUser().
    const authSupabase = await createClient()
    const adminSupabase = createAdminClient()

    const { data: { user }, error: userError } = await authSupabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { data: teacher, error: teacherError } = await adminSupabase
      .from("teachers")
      .select("id, role")
      .eq("user_id", user.id)
      .single()

    if (teacherError || !teacher) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
    }

    const isAdmin = ["admin", "superadmin"].includes(teacher.role ?? "")

    if (resource === "assessment") {
      const { data: assessment, error: assessmentError } = await adminSupabase
        .from("assessments")
        .select("id, teacher_id, official_pdf_path")
        .eq("id", id)
        .single()

      if (assessmentError || !assessment) {
        return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 })
      }

      if (assessment.teacher_id !== teacher.id && assessment.teacher_id !== user.id && !isAdmin) {
        return NextResponse.json({ error: "Sin permisos para eliminar esta evaluación" }, { status: 403 })
      }

      // 1) Buscar envíos y archivos asociados antes de borrar registros.
      const { data: submissions } = await adminSupabase
        .from("submissions")
        .select("id")
        .eq("assessment_id", id)

      const submissionIds = (submissions ?? []).map((s: { id: string }) => s.id)

      if (submissionIds.length > 0) {
        const { data: pages } = await adminSupabase
          .from("submission_pages")
          .select("image_path")
          .in("submission_id", submissionIds)

        const imagePaths = (pages ?? [])
          .map((p: { image_path: string | null }) => p.image_path)
          .filter((p: string | null): p is string => Boolean(p))

        if (imagePaths.length > 0) {
          await adminSupabase.storage.from("submission-images").remove(imagePaths)
        }
      }

      if (assessment.official_pdf_path) {
        await adminSupabase.storage.from("assessment-assets").remove([assessment.official_pdf_path])
      }

      // 2) Borrar tablas dependientes explícitamente.
      // Aunque algunas FK tienen ON DELETE CASCADE, hay columnas assessment_id sin cascade.
      if (submissionIds.length > 0) {
        await adminSupabase.from("ocr_feedback").delete().in("submission_id", submissionIds)
        await adminSupabase.from("grading_results").delete().in("submission_id", submissionIds)
        await adminSupabase.from("submission_pages").delete().in("submission_id", submissionIds)
      }

      await adminSupabase.from("grading_results").delete().eq("assessment_id", id)
      await adminSupabase.from("submission_pages").delete().eq("assessment_id", id)
      await adminSupabase.from("class_insights").delete().eq("assessment_id", id)
      await adminSupabase.from("submissions").delete().eq("assessment_id", id)

      // 3) Borrar evaluación.
      const { error: deleteError } = await adminSupabase
        .from("assessments")
        .delete()
        .eq("id", id)

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, deleted: "assessment" })
    }

    if (resource === "library_exam") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Solo admins pueden eliminar de la biblioteca" }, { status: 403 })
      }

      const { data: exam } = await adminSupabase
        .from("library_exams")
        .select("pdf_path")
        .eq("id", id)
        .single()

      if (exam?.pdf_path) {
        await adminSupabase.storage.from("library-pdfs").remove([exam.pdf_path])
      }

      const { error } = await adminSupabase.from("library_exams").delete().eq("id", id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ ok: true, deleted: "library_exam" })
    }

    if (resource === "submission") {
      const { data: submission, error: submissionError } = await adminSupabase
        .from("submissions")
        .select("id, teacher_id")
        .eq("id", id)
        .single()

      if (submissionError || !submission) {
        return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 })
      }

      if (submission.teacher_id !== teacher.id && submission.teacher_id !== user.id && !isAdmin) {
        return NextResponse.json({ error: "Sin permisos para eliminar este envío" }, { status: 403 })
      }

      const { data: pages } = await adminSupabase
        .from("submission_pages")
        .select("image_path")
        .eq("submission_id", id)

      const imagePaths = (pages ?? [])
        .map((p: { image_path: string | null }) => p.image_path)
        .filter((p: string | null): p is string => Boolean(p))

      if (imagePaths.length > 0) {
        await adminSupabase.storage.from("submission-images").remove(imagePaths)
      }

      await adminSupabase.from("ocr_feedback").delete().eq("submission_id", id)
      await adminSupabase.from("grading_results").delete().eq("submission_id", id)
      await adminSupabase.from("submission_pages").delete().eq("submission_id", id)

      const { error } = await adminSupabase.from("submissions").delete().eq("id", id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ ok: true, deleted: "submission" })
    }

    return NextResponse.json({ error: "Recurso no válido" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al eliminar"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
