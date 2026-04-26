// app/api/library/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient as createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const subject = searchParams.get("subject")
    const grade = searchParams.get("grade")
    const search = searchParams.get("search")
    const supabase = createAdminClient()

    let query = supabase
      .from("library_exams")
      .select("id, title, subject, grade_level, description, pdf_path, assessment_structure, total_points, tags, school_name, download_count, is_public, uploaded_by, created_at, teachers(full_name)")
      .eq("is_public", true)
      .order("created_at", { ascending: false })

    if (subject) query = query.eq("subject", subject)
    if (grade) query = query.eq("grade_level", grade)
    if (search) query = query.ilike("title", `%${search}%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ exams: data ?? [] })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await authClient.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const admin = createAdminClient()
    const { data: teacher, error: teacherError } = await admin
      .from("teachers")
      .select("id, full_name, role")
      .eq("user_id", user.id)
      .single()

    if (teacherError || !teacher) return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

    const body = await req.json()
    const { title, subject, grade_level, description, pdf_path, assessment_structure, total_points, tags, school_name } = body

    if (!title || !subject || !grade_level || !pdf_path) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 })
    }

    const { data: existing } = await admin
      .from("library_exams")
      .select("id")
      .eq("pdf_path", pdf_path)
      .maybeSingle()

    const payload = {
      title,
      subject,
      grade_level,
      description: description ?? null,
      pdf_path,
      assessment_structure: assessment_structure ?? null,
      total_points: total_points ?? null,
      tags: Array.isArray(tags) ? tags : [],
      school_name: school_name ?? null,
      uploaded_by: teacher.id,
      is_public: true,
    }

    const query = existing?.id
      ? admin.from("library_exams").update(payload).eq("id", existing.id)
      : admin.from("library_exams").insert(payload)

    const { data, error } = await query.select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, exam: data })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
