// lib/auth/admin-guard.ts

import { createAdminClient } from "@/lib/supabase/server"

export type UserRole = "teacher" | "admin" | "superadmin"

export async function getCurrentTeacher() {
  const supabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: teacher } = await supabase
    .from("teachers")
    .select("id, full_name, email, role")
    .eq("user_id", user.id)
    .single()

  return teacher ?? null
}

export async function requireAdmin() {
  const teacher = await getCurrentTeacher()
  if (!teacher || !["admin", "superadmin"].includes(teacher.role ?? "")) {
    return null
  }
  return teacher
}

export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("teachers")
    .select("role")
    .eq("user_id", userId)
    .single()
  return ["admin", "superadmin"].includes(data?.role ?? "")
}
