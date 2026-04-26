"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Teacher = {
  id: string
  full_name: string
  email: string
  role: string
  created_at: string
}

type Stats = {
  total_assessments: number
  total_submissions: number
  total_students: number
  total_teachers: number
  total_library_exams: number
}

export default function AdminPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<"users" | "reports" | "settings">("users")
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = "/login"; return }

      const { data: t } = await supabase.from("teachers").select("role").eq("user_id", user.id).single()
      if (!["admin", "superadmin"].includes(t?.role ?? "")) {
        window.location.href = "/"
        return
      }
      setIsAdmin(true)

      // Cargar datos
      const [teachersRes, statsRes] = await Promise.all([
        fetch("/api/admin/users"),
        loadStats(),
      ])
      const teachersData = await teachersRes.json()
      setTeachers(teachersData.teachers ?? [])
      setStats(statsRes)
      setLoading(false)
    }
    load()
  }, [])

  async function loadStats(): Promise<Stats> {
    const [a, s, st, t, l] = await Promise.all([
      supabase.from("assessments").select("id", { count: "exact", head: true }),
      supabase.from("submissions").select("id", { count: "exact", head: true }),
      supabase.from("students").select("id", { count: "exact", head: true }),
      supabase.from("teachers").select("id", { count: "exact", head: true }),
      supabase.from("library_exams").select("id", { count: "exact", head: true }),
    ])
    return {
      total_assessments: a.count ?? 0,
      total_submissions: s.count ?? 0,
      total_students: st.count ?? 0,
      total_teachers: t.count ?? 0,
      total_library_exams: l.count ?? 0,
    }
  }

  async function handleRoleChange(teacherId: string, newRole: string) {
    setUpdatingRole(teacherId)
    await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, role: newRole }),
    })
    setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, role: newRole } : t))
    setUpdatingRole(null)
  }

  async function handlePasswordReset() {
    setResetMsg(null)
    if (!resetEmail.trim()) return
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetMsg(error ? `Error: ${error.message}` : `✓ Email de restablecimiento enviado a ${resetEmail}`)
    setResetEmail("")
  }

  if (!isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-gray-600 text-sm">←</a>
            <div>
              <h1 className="font-semibold text-gray-900">Panel de administración</h1>
              <p className="text-xs text-gray-400">Solo visible para administradores</p>
            </div>
          </div>
          <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">ADMIN</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-5 gap-3 mb-6">
            {[
              { label: "Docentes", value: stats.total_teachers },
              { label: "Evaluaciones", value: stats.total_assessments },
              { label: "Envíos", value: stats.total_submissions },
              { label: "Estudiantes", value: stats.total_students },
              { label: "Biblioteca", value: stats.total_library_exams },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(["users", "reports", "settings"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm px-4 py-2 font-medium border-b-2 -mb-px transition ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {{ users: "Usuarios", reports: "Reportes", settings: "Configuración" }[t]}
            </button>
          ))}
        </div>

        {/* Tab: Usuarios */}
        {tab === "users" && (
          <div className="space-y-4">
            {/* Reset de contraseña */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-medium text-gray-900 mb-4">Restablecer contraseña de docente</h3>
              {resetMsg && (
                <div className={`text-sm px-4 py-2 rounded-lg mb-3 ${resetMsg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {resetMsg}
                </div>
              )}
              <div className="flex gap-3">
                <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                  placeholder="email@docente.cl"
                  className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={handlePasswordReset}
                  className="bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-gray-800 transition font-medium">
                  Enviar email
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">Se enviará un email con enlace para crear nueva contraseña.</p>
            </div>

            {/* Lista de usuarios */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Todos los usuarios ({teachers.length})</h3>
              </div>
              {loading ? (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">Cargando...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Nombre</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-500">Rol</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Registro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {teachers.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{t.full_name || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{t.email}</td>
                        <td className="px-4 py-3 text-center">
                          <select
                            value={t.role ?? "teacher"}
                            disabled={updatingRole === t.id}
                            onChange={e => handleRoleChange(t.id, e.target.value)}
                            className={`text-xs font-medium px-2 py-1 rounded border ${t.role === "admin" || t.role === "superadmin" ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-600"}`}
                          >
                            <option value="teacher">Docente</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {new Date(t.created_at).toLocaleDateString("es-CL")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab: Reportes */}
        {tab === "reports" && stats && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-medium text-gray-900 mb-4">Resumen de la plataforma</h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Total de docentes registrados", stats.total_teachers],
                  ["Total de evaluaciones creadas", stats.total_assessments],
                  ["Total de envíos procesados", stats.total_submissions],
                  ["Total de estudiantes registrados", stats.total_students],
                  ["Exámenes en la biblioteca", stats.total_library_exams],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between py-2 border-b border-gray-50">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              Los reportes detallados por docente, por evaluación y exportación Excel estarán disponibles en la próxima actualización.
            </div>
          </div>
        )}

        {/* Tab: Configuración */}
        {tab === "settings" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-medium text-gray-900 mb-4">Configuración del sistema</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <p>Para hacer admin a un usuario, ve a la pestaña <strong>Usuarios</strong> y cambia su rol con el selector.</p>
              <p>Para eliminar evaluaciones o archivos de la biblioteca, usa el botón Eliminar que aparece en cada recurso (solo visible para admins).</p>
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-xs text-gray-500">
                -- Para hacer admin manualmente en Supabase SQL Editor:<br />
                UPDATE teachers SET role = 'admin' WHERE email = 'tu@email.cl';
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
