"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type InsightData = {
  total_students: number
  graded_count: number
  avg_grade: number
  pass_rate: number
  top_score: number
  lowest_score: number
  hardest_questions: { question_id: string; avg_pct: number }[]
  common_errors: { error: string; count: number }[]
  topics_to_reinforce: string[]
  ai_analysis: string | null
  ai_suggestions: string | null
  generated_at: string
}

export default function InsightsPage() {
  const params = useParams()
  const assessmentId = params.id as string
  const supabase = createClient()

  const [insights, setInsights] = useState<InsightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [assessmentTitle, setAssessmentTitle] = useState("")

  useEffect(() => {
    async function load() {
      const [{ data: a }, { data: i }] = await Promise.all([
        supabase.from("assessments").select("title").eq("id", assessmentId).single(),
        supabase.from("class_insights").select("*").eq("assessment_id", assessmentId).single(),
      ])
      setAssessmentTitle(a?.title ?? "Evaluación")
      setInsights(i ?? null)
      setLoading(false)
    }
    load()
  }, [assessmentId])

  async function generate() {
    setGenerating(true)
    const res = await fetch(`/api/assessments/${assessmentId}/insights`, { method: "POST" })
    const json = await res.json()
    if (json.ok) {
      // Recargar insights desde Supabase
      const { data } = await supabase
        .from("class_insights")
        .select("*")
        .eq("assessment_id", assessmentId)
        .single()
      setInsights(data)
    }
    setGenerating(false)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">Cargando...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href={`/assessments/${assessmentId}`} className="text-gray-400 hover:text-gray-600 text-sm">←</a>
            <div>
              <h1 className="font-semibold text-gray-900">Analítica del curso</h1>
              <p className="text-xs text-gray-400">{assessmentTitle}</p>
            </div>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {generating ? "Generando..." : insights ? "↻ Actualizar" : "Generar analítica"}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        {!insights ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500 mb-2">No hay analítica generada aún.</p>
            <p className="text-sm text-gray-400 mb-6">
              Asegúrate de tener al menos un envío corregido antes de generar.
            </p>
            <button
              onClick={generate}
              disabled={generating}
              className="bg-blue-600 text-white text-sm px-6 py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {generating ? "Generando..." : "Generar ahora →"}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Stats principales */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Estudiantes", value: `${insights.graded_count}/${insights.total_students}` },
                { label: "Promedio", value: insights.avg_grade?.toFixed(1) ?? "—" },
                { label: "Aprobación", value: `${insights.pass_rate?.toFixed(0) ?? "—"}%` },
                { label: "Nota más alta", value: insights.top_score?.toFixed(1) ?? "—" },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Análisis IA */}
            {insights.ai_analysis && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Análisis IA</span>
                  <h3 className="font-medium text-gray-900">Resumen pedagógico</h3>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{insights.ai_analysis}</p>
                {insights.ai_suggestions && (
                  <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-xs font-medium text-blue-700 mb-1">Sugerencia de reforzamiento</p>
                    <p className="text-sm text-blue-800 leading-relaxed">{insights.ai_suggestions}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Ejercicios más difíciles */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-medium text-gray-900 mb-4">Ejercicios más difíciles</h3>
                {insights.hardest_questions?.length ? (
                  <div className="space-y-3">
                    {insights.hardest_questions.map((q) => (
                      <div key={q.question_id}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">{q.question_id}</span>
                          <span className={`font-medium ${q.avg_pct < 40 ? "text-red-600" : q.avg_pct < 60 ? "text-amber-600" : "text-green-600"}`}>
                            {q.avg_pct}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${q.avg_pct < 40 ? "bg-red-400" : q.avg_pct < 60 ? "bg-amber-400" : "bg-green-500"}`}
                            style={{ width: `${q.avg_pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">Sin datos</p>}
              </div>

              {/* Errores más comunes */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-medium text-gray-900 mb-4">Errores más frecuentes</h3>
                {insights.common_errors?.length ? (
                  <div className="space-y-2">
                    {insights.common_errors.map((e, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded min-w-[28px] text-center font-medium">
                          {e.count}x
                        </span>
                        <p className="text-sm text-gray-700 flex-1">{e.error}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">Sin datos</p>}
              </div>
            </div>

            {/* Temas a reforzar */}
            {insights.topics_to_reinforce?.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-medium text-gray-900 mb-3">Temas a reforzar</h3>
                <div className="flex flex-wrap gap-2">
                  {insights.topics_to_reinforce.map((t, i) => (
                    <span key={i} className="text-sm bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 text-right">
              Generado: {new Date(insights.generated_at).toLocaleString("es-CL")}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
