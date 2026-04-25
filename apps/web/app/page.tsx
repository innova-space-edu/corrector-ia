"use client"

import { useEffect, useMemo, useState } from "react"
import { AppShell } from "@/components/AppShell"
import { RainbowProgress } from "@/components/RainbowProgress"
import { createClient } from "@/lib/supabase/client"
import type { Assessment } from "@/types/assessment"

const statusLabel: Record<string, string> = {
  draft: "Borrador",
  active: "Activa",
  closed: "Cerrada",
  archived: "Archivada",
}

const statusColor: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-blue-50 text-blue-700 ring-blue-200",
  archived: "bg-orange-50 text-orange-700 ring-orange-200",
}

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

  const stats = useMemo(() => {
    const active = assessments.filter((a) => a.status === "active").length
    const draft = assessments.filter((a) => a.status === "draft").length
    const closed = assessments.filter((a) => a.status === "closed").length

    return [
      { label: "Activas", value: active, icon: "🟢", helper: "Listas para recibir respuestas" },
      { label: "Borradores", value: draft, icon: "📝", helper: "Pendientes de revisar" },
      { label: "Cerradas", value: closed, icon: "🔒", helper: "Evaluaciones finalizadas" },
      { label: "Total", value: assessments.length, icon: "📚", helper: "Historial docente" },
    ]
  }, [assessments])

  if (loading) {
    return (
      <AppShell title="Cargando panel" subtitle="Preparando tu espacio docente inteligente">
        <div className="grid min-h-[60vh] place-items-center">
          <div className="w-full max-w-xl space-y-5 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-blue-600 text-3xl text-white shadow-xl shadow-blue-200">
              ✨
            </div>
            <RainbowProgress label="Cargando evaluaciones y panel docente" />
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      title="Panel docente inteligente"
      subtitle="Crea evaluaciones, corrige con IA y revisa resultados en un espacio claro y amigable."
      action={
        <a
          href="/assessments/new"
          className="hidden rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-700 md:inline-flex"
        >
          + Nueva evaluación
        </a>
      }
    >
      <section className="rainbow-border relative overflow-hidden rounded-[2rem] bg-white p-6 shadow-xl shadow-blue-100/50 md:p-8">
        <div className="absolute right-6 top-6 hidden h-28 w-28 rounded-full bg-cyan-100 blur-2xl md:block" />
        <div className="absolute bottom-0 right-24 hidden h-24 w-24 rounded-full bg-violet-100 blur-2xl md:block" />

        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              Corrector IA Docente
            </span>
            <h2 className="mt-4 max-w-2xl text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
              Menos tiempo corrigiendo, más tiempo enseñando.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Sube pruebas, analiza respuestas, revisa notas y genera retroalimentación con una interfaz blanca, azul y simple para el trabajo diario del docente.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/assessments/new"
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
              >
                Crear evaluación
              </a>
              <a
                href="#evaluaciones"
                className="rounded-2xl border border-blue-100 bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-50"
              >
                Ver evaluaciones
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
            <p className="text-sm font-bold text-slate-700">Flujo recomendado</p>
            <div className="mt-4 space-y-3">
              {["Crear evaluación", "Subir PDF o imagen", "Corregir con IA", "Revisar reporte"].map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600 text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{step}</span>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <RainbowProgress label="Barra IA de avance" />
            </div>
          </div>
        </div>
      </section>

      <section id="analitica" className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-100/60">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                <p className="mt-2 text-4xl font-black text-slate-950">{item.value}</p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-2xl">{item.icon}</span>
            </div>
            <p className="mt-3 text-xs text-slate-500">{item.helper}</p>
          </div>
        ))}
      </section>

      <section id="evaluaciones" className="mt-7 rounded-[2rem] border border-blue-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-blue-50 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Evaluaciones recientes</h2>
            <p className="text-sm text-slate-500">Accede rápido a tus pruebas, envíos e insights.</p>
          </div>
          <a href="/assessments/new" className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
            + Nueva evaluación
          </a>
        </div>

        {assessments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-blue-50 text-3xl">📄</div>
            <h3 className="mt-4 text-lg font-black text-slate-900">Aún no tienes evaluaciones</h3>
            <p className="mt-2 text-sm text-slate-500">Comienza creando tu primera evaluación para activar el flujo de corrección IA.</p>
            <a href="/assessments/new" className="mt-5 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200">
              Crear primera evaluación
            </a>
          </div>
        ) : (
          <div className="divide-y divide-blue-50">
            {assessments.map((a) => (
              <a key={a.id} href={`/assessments/${a.id}`} className="group flex flex-col gap-4 px-6 py-5 transition hover:bg-blue-50/60 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-md shadow-blue-100">
                    📘
                  </div>
                  <div>
                    <p className="font-black text-slate-950 group-hover:text-blue-700">{a.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {a.subject} · {a.grade_level ?? "Nivel no definido"} · {a.total_points ?? "—"} pts
                    </p>
                  </div>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ring-1 ${statusColor[a.status] ?? statusColor.draft}`}>
                  {statusLabel[a.status] ?? a.status}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
