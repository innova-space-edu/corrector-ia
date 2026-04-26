// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const runtime = "nodejs"

// GET — lista todos los usuarios
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

  const supabase = createAdminClient()

  const { data: teachers } = await supabase
    .from("teachers")
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false })

  return NextResponse.json({ teachers: teachers ?? [] })
}

// POST — cambiar rol de usuario
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

  const { teacherId, role } = await req.json()
  if (!teacherId || !role) return NextResponse.json({ error: "Faltan datos" }, { status: 400 })
  if (!["teacher", "admin"].includes(role)) return NextResponse.json({ error: "Rol inválido" }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("teachers")
    .update({ role })
    .eq("id", teacherId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
