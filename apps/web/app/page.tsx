"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { AppShell } from "@/components/AppShell"
import Link from "next/link"
import type { Assessment } from "@/types/assessment"

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", active: "Activa", closed: "Cerrada", archived: "Archivada",
}
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-blue-100 text-blue-700",
  archived: "bg-orange-100 text-orange-700",
}

export default function DashboardPage() {
  const supabase = createClient()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = "/login"; return }

      const { data: t } = await supabase
        .from("teachers")
        .select("role")
        .eq("user_id", user.id)
        .single()
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
    if (!confirm(`¿Eliminar "${title}"? Se borrarán todos los envíos y resultados. Esta acción no se puede deshacer.`)) return
    setDeleting(id)
    await fetch("/api/admin/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "assessment", id }),
    })
    setAssessments(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
  }

  const activas   = assessments.filter(a => a.status === "active").length
  const borradores = assessments.filter(a => a.status === "draft").length
  const cerradas  = assessments.filter(a => a.status === "closed").length

  const headerAction = (
    <div className="flex items-center gap-2">
      <Link
        href="/library"
        className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
      >
        Biblioteca
      </Link>
      {isAdmin && (
        <Link
          href="/admin"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
        >
          Admin
        </Link>
      )}
      <Link
        href="/assessments/new"
        className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2 text-sm font-bold text-white shadow-md shadow-blue-200 transition hover:opacity-90"
      >
        + Nueva evaluación
      </Link>
    </div>
  )

  return (
    <AppShell
      title="Panel docente inteligente"
      subtitle="Crea evaluaciones, corrige con IA y revisa resultados en un espacio claro y amigable."
      action={headerAction}
    >
      {/* Hero */}
      <div className="mb-8 grid gap-5 lg:grid-cols-3">
        <div className="col-span-2 rounded-3xl border border-blue-100 bg-white p-8 shadow-sm">
          <div className="mb-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-600">
            Corrector IA Docente
          </div>
          <h2 className="text-4xl font-black leading-tight tracking-tight text-slate-900">
            Menos tiempo corrigiendo,<br />más tiempo enseñando.
          </h2>
          <p className="mt-3 text-sm text-slate-500 leading-relaxed">
            Sube pruebas, analiza respuestas, revisa notas y genera retroalimentación con una interfaz blanca, azul y simple para el trabajo diario del docente.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/assessments/new"
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              Crear evaluación
            </Link>
            <Link
              href="#evaluaciones"
              className="rounded-2xl border border-blue-200 px-6 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              Ver evaluaciones
            </Link>
          </div>
        </div>

        {/* Flujo recomendado */}
        <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm font-bold text-slate-700">Flujo recomendado</p>
          <div className="space-y-3">
            {[
              { n: 1, label: "Crear evaluación" },
              { n: 2, label: "Subir PDF o imagen" },
              { n: 3, label: "Corregir con IA" },
              { n: 4, label: "Revisar reporte" },
            ].map(step => (
              <div key={step.n} className="flex items-center gap-3">
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {step.n}
                </div>
                <span className="text-sm font-medium text-slate-700">{step.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Barra IA de avance</span>
              <span className="text-blue-600">En progreso</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
                style={{ width: assessments.length > 0 ? "65%" : "10%" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-4 gap-4" id="evaluaciones">
        {[
          { label: "Activas", value: activas, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Borradores", value: borradores, color: "text-slate-600", bg: "bg-slate-50" },
          { label: "Cerradas", value: cerradas, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total", value: assessments.length, color: "text-violet-600", bg: "bg-violet-50" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border border-slate-100 ${s.bg} p-5`}>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="mt-0.5 text-sm font-medium text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabla de evaluaciones */}
      <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="font-bold text-slate-800">Evaluaciones recientes</h3>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Cargando...</div>
        ) : assessments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-400">No hay evaluaciones aún.</p>
            <Link href="/assessments/new" className="mt-2 block text-sm text-blue-600 hover:underline">
              Crear primera evaluación →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {assessments.map(a => (
              <div key={a.id} className="flex items-center justify-between px-6 py-4 transition hover:bg-blue-50/40">
                <Link href={`/assessments/${a.id}`} className="flex-1 min-w-0">
                  <p className="truncate font-semibold text-slate-900">{a.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {a.subject} · {a.grade_level ?? "—"} · {a.total_points ?? "—"} pts
                  </p>
                </Link>
                <div className="ml-4 flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  <button
                    onClick={() => handleDelete(a.id, a.title)}
                    disabled={deleting === a.id}
                    className="text-xs text-red-400 transition hover:text-red-600 disabled:opacity-40"
                  >
                    {deleting === a.id ? "..." : "Eliminar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
