"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Assessment } from "@/types/assessment"

export default function DashboardPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = "/login"; return }

      const { data: t } = await supabase.from("teachers").select("role").eq("user_id", user.id).single()
      setIsAdmin(["admin", "superadmin"].includes(t?.role ?? ""))

      const { data } = await supabase
        .from("assessments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)
      setAssessments(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleDelete(id: string, title: string) {
    if (!confirm(`¿Eliminar la evaluación "${title}"? Se eliminarán también todos los envíos y resultados. Esta acción no se puede deshacer.`)) return
    setDeleting(id)
    const res = await fetch("/api/admin/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "assessment", id }),
    })
    if (res.ok) {
      setAssessments(prev => prev.filter(a => a.id !== id))
    }
    setDeleting(null)
  }

  const statusLabel: Record<string, string> = {
    draft: "Borrador", active: "Activa", closed: "Cerrada", archived: "Archivada",
  }
  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    closed: "bg-blue-100 text-blue-700",
    archived: "bg-orange-100 text-orange-700",
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">Cargando...</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Corrector IA</h1>
            <p className="text-sm text-gray-500">Panel docente</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/library" className="text-sm border border-gray-200 px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition">
              Biblioteca
            </a>
            {isAdmin && (
              <a href="/admin" className="text-sm bg-red-50 border border-red-200 px-4 py-2 rounded-lg text-red-700 hover:bg-red-100 transition font-medium">
                Admin
              </a>
            )}
            <a href="/assessments/new" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium">
              + Nueva evaluación
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Activas", value: assessments.filter(a => a.status === "active").length },
            { label: "Borradores", value: assessments.filter(a => a.status === "draft").length },
            { label: "Cerradas", value: assessments.filter(a => a.status === "closed").length },
            { label: "Total", value: assessments.length },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-3xl font-bold text-gray-900">{s.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Evaluaciones recientes</h2>
          </div>

          {assessments.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">
              <p>No hay evaluaciones aún.</p>
              <a href="/assessments/new" className="text-blue-600 hover:underline mt-2 block">Crear primera evaluación →</a>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {assessments.map(a => (
                <div key={a.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition">
                  <a href={`/assessments/${a.id}`} className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{a.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {a.subject} · {a.grade_level ?? "—"} · {a.total_points ?? "—"} pts
                    </p>
                  </a>
                  <div className="flex items-center gap-3 ml-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {statusLabel[a.status] ?? a.status}
                    </span>
                    <button
                      onClick={() => handleDelete(a.id, a.title)}
                      disabled={deleting === a.id}
                      className="text-xs text-red-400 hover:text-red-600 border border-transparent hover:border-red-200 px-2 py-1 rounded transition disabled:opacity-50"
                    >
                      {deleting === a.id ? "..." : "Eliminar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
