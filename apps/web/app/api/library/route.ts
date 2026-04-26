// app/api/library/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

// GET — listar exámenes de la biblioteca
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subject = searchParams.get("subject")
  const grade = searchParams.get("grade")
  const search = searchParams.get("search")

  const supabase = createAdminClient()

  let query = supabase
    .from("library_exams")
    .select("id, title, subject, grade_level, description, pdf_path, total_points, tags, school_name, download_count, created_at, teachers(full_name)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })

  if (subject) query = query.eq("subject", subject)
  if (grade) query = query.eq("grade_level", grade)
  if (search) query = query.ilike("title", `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exams: data ?? [] })
}

// POST — subir examen a la biblioteca
export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data: teacher } = await supabase
    .from("teachers")
    .select("id, full_name")
    .eq("user_id", user.id)
    .single()
  if (!teacher) return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

  const body = await req.json()
  const { title, subject, grade_level, description, pdf_path, assessment_structure, total_points, tags, school_name } = body

  if (!title || !subject || !grade_level || !pdf_path) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("library_exams")
    .insert({
      title, subject, grade_level, description,
      pdf_path, assessment_structure, total_points,
      tags, school_name,
      uploaded_by: teacher.id,
      is_public: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, exam: data })
}
