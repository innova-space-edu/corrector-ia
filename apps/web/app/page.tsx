"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Assessment } from "@/types/assessment"

export default function DashboardPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("assessments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20)
      setAssessments(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const statusLabel: Record<string, string> = {
    draft: "Borrador",
    active: "Activa",
    closed: "Cerrada",
    archived: "Archivada",
  }

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    closed: "bg-blue-100 text-blue-700",
    archived: "bg-orange-100 text-orange-700",
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Corrector IA</h1>
            <p className="text-sm text-gray-500">Panel docente</p>
          </div>
          <a
            href="/assessments/new"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            + Nueva evaluación
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Stats rápidas */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Evaluaciones activas</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {assessments.filter((a) => a.status === "active").length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Borradores</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {assessments.filter((a) => a.status === "draft").length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Total evaluaciones</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{assessments.length}</p>
          </div>
        </div>

        {/* Lista de evaluaciones */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-medium text-gray-900">Evaluaciones recientes</h2>
          </div>

          {assessments.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">
              <p>No hay evaluaciones aún.</p>
              <a href="/assessments/new" className="text-blue-600 hover:underline mt-2 block">
                Crear primera evaluación →
              </a>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {assessments.map((a) => (
                <a
                  key={a.id}
                  href={`/assessments/${a.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
                >
                  <div>
                    <p className="font-medium text-gray-900">{a.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {a.subject} · {a.grade_level ?? "—"} · {a.total_points ?? "—"} pts
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      statusColor[a.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {statusLabel[a.status] ?? a.status}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
