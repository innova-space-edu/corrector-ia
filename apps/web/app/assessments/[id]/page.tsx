"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { subscribeToSubmissions } from "@/lib/realtime"
import type { Assessment, Submission, ParsedAssessmentStructure } from "@/types/assessment"

type SubmissionWithStudent = Submission & {
  students: { id: string; full_name: string } | null
}

const GRADE_COLOR = (g?: number) => {
  if (!g) return "text-gray-400"
  if (g >= 6) return "text-green-600"
  if (g >= 4) return "text-blue-600"
  return "text-red-600"
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", partial: "Parcial",
  completed: "Corregido", needs_review: "Revisar",
}
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  partial: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  needs_review: "bg-red-100 text-red-700",
}

export default function AssessmentPage() {
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionWithStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"overview" | "submissions" | "structure">("overview")
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchResult, setBatchResult] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [liveIndicator, setLiveIndicator] = useState(false)

  const load = useCallback(async () => {
    const [{ data: a }, { data: s }] = await Promise.all([
      supabase.from("assessments").select("*").eq("id", id).single(),
      supabase
        .from("submissions")
        .select("*, students(id, full_name)")
        .eq("assessment_id", id)
        .order("submitted_at", { ascending: false }),
    ])
    setAssessment(a)
    setSubmissions(s ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
    // REALTIME: escuchar cambios en vivo cuando la app sube imágenes
    const unsubscribe = subscribeToSubmissions(id, () => {
      setLiveIndicator(true)
      load()
      setTimeout(() => setLiveIndicator(false), 2000)
    })
    return unsubscribe
  }, [id, load])

  async function toggleStatus() {
    if (!assessment) return
    const next = assessment.status === "active" ? "closed" : "active"
    await supabase.from("assessments").update({ status: next }).eq("id", id)
    setAssessment({ ...assessment, status: next })
  }

  async function handleBatchCorrect() {
    // Verificar que tiene clave de corrección antes de corregir
    if (!assessment?.answer_key_json || Object.keys(assessment.answer_key_json).length === 0) {
      setBatchResult("⚠ Debes completar la clave de corrección antes de corregir automáticamente")
      return
    }
    setBatchRunning(true)
    setBatchResult(null)
    const res = await fetch("/api/submissions/batch-correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId: id }),
    })
    const json = await res.json()
    setBatchResult(json.ok
      ? `✓ ${json.corrected} ejercicios corregidos de ${json.total} pendientes`
      : `Error: ${json.error}`)
    if (json.ok) await load()
    setBatchRunning(false)
  }

  async function handleExport() {
    setExporting(true)
    const res = await fetch(`/api/assessments/${id}/export`)
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const header = res.headers.get("Content-Disposition") ?? ""
      const match = header.match(/filename="(.+)"/)
      a.download = match?.[1] ?? "notas.xlsx"
      a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">Cargando...</p></div>
  if (!assessment) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">No encontrado.</p></div>

  const structure = assessment.official_test_json as ParsedAssessmentStructure | null
  const completed = submissions.filter(s => s.grading_status === "completed").length
  const toReview = submissions.filter(s => s.grading_status === "needs_review").length
  const pending = submissions.filter(s => s.grading_status === "pending").length
  const grades = submissions.map(s => s.final_grade).filter((g): g is number => g != null)
  const avgGrade = grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : "—"
  const hasAnswerKey = assessment.answer_key_json && Object.keys(assessment.answer_key_json).length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <a href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Inicio</a>
                {/* Indicador en tiempo real */}
                {liveIndicator && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full animate-pulse font-medium">
                    ● En vivo
                  </span>
                )}
              </div>
              <h1 className="text-xl font-semibold text-gray-900">{assessment.title}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {assessment.subject} · {assessment.grade_level ?? "—"} · {assessment.total_points ?? "—"} pts
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={toggleStatus}
                className={`text-sm px-3 py-2 rounded-lg font-medium transition border ${
                  assessment.status === "active"
                    ? "border-gray-200 text-gray-600 hover:bg-gray-50"
                    : "bg-green-600 text-white border-transparent hover:bg-green-700"
                }`}>
                {assessment.status === "active" ? "Cerrar" : "Activar"}
              </button>
              <a href={`/assessments/${id}/answer-key`}
                className={`text-sm px-3 py-2 rounded-lg font-medium transition border ${
                  hasAnswerKey
                    ? "border-green-300 text-green-700 bg-green-50 hover:bg-green-100"
                    : "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                }`}>
                {hasAnswerKey ? "✓ Clave" : "⚠ Completar clave"}
              </a>
              <a href={`/assessments/${id}/upload`}
                className="text-sm border border-gray-200 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition">
                + Subir
              </a>
              <button onClick={handleBatchCorrect} disabled={batchRunning || pending === 0}
                className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">
                {batchRunning ? "Corrigiendo..." : `Corregir todo${pending > 0 ? ` (${pending})` : ""}`}
              </button>
              <button onClick={handleExport} disabled={exporting || submissions.length === 0}
                className="text-sm bg-green-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50">
                {exporting ? "..." : "⬇ Excel"}
              </button>
              <a href={`/assessments/${id}/insights`}
                className="text-sm border border-gray-200 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition">
                Analítica
              </a>
            </div>
          </div>

          {/* Alerta de clave faltante */}
          {!hasAnswerKey && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm text-amber-800">
              <span>⚠</span>
              <span>Completa la <a href={`/assessments/${id}/answer-key`} className="font-semibold underline">clave de corrección</a> antes de que la IA corrija selección múltiple y verdadero/falso.</span>
            </div>
          )}

          {batchResult && (
            <div className={`mt-3 text-sm px-4 py-2 rounded-lg ${batchResult.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {batchResult}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "Envíos", value: submissions.length },
            { label: "Corregidos", value: completed },
            { label: "Para revisar", value: toReview },
            { label: "Pendientes", value: pending },
            { label: "Promedio", value: avgGrade },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(["overview", "submissions", "structure"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm px-4 py-2 font-medium border-b-2 -mb-px transition ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {{ overview: "Resumen", submissions: `Envíos (${submissions.length})`, structure: "Estructura" }[t]}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-medium text-gray-900 mb-3">Información general</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Asignatura", assessment.subject],
                  ["Nivel", assessment.grade_level ?? "—"],
                  ["Puntaje total", assessment.total_points ?? "—"],
                  ["Exigencia", `${assessment.passing_percentage ?? 60}%`],
                  ["Clave cargada", hasAnswerKey ? "✓ Sí" : "✗ No"],
                  ["Estado", assessment.status],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="font-medium text-gray-900 capitalize">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {tab === "submissions" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {submissions.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400">
                <p className="mb-2">No hay envíos aún.</p>
                <p className="text-sm text-blue-500">Los envíos desde la app aparecerán aquí en tiempo real ●</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Estudiante</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Puntaje</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Nota</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {submissions.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <a href={`/students/${s.students?.id ?? s.student_id}`}
                          className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                          {s.students?.full_name ?? "—"}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {s.total_score != null ? `${s.total_score}/${s.max_score}` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-center font-bold ${GRADE_COLOR(s.final_grade ?? undefined)}`}>
                        {s.final_grade ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[s.grading_status] ?? "bg-gray-100 text-gray-500"}`}>
                          {STATUS_LABEL[s.grading_status] ?? s.grading_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-3 justify-end">
                          <a href={`/assessments/${id}/review/${s.id}`} className="text-blue-600 hover:underline text-xs">Revisar</a>
                          <a href={`/assessments/${id}/report/${s.id}`} className="text-gray-400 hover:underline text-xs">Informe</a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "structure" && (
          <div className="space-y-4">
            {!structure ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                <p>No hay estructura detectada.</p>
                <a href="/assessments/new" className="text-blue-600 text-sm mt-2 block hover:underline">
                  Crea una evaluación nueva con PDF →
                </a>
              </div>
            ) : (
              structure.items?.map(item => (
                <div key={item.item_id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900">{item.label}</h3>
                    {item.points_rule && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.points_rule}</span>}
                  </div>
                  <div className="space-y-2">
                    {item.questions.map((q, i) => (
                      <div key={q.question_id} className="flex gap-3 text-sm text-gray-700 pl-2">
                        <span className="text-gray-400 min-w-[20px]">{i + 1}.</span>
                        <span className="flex-1">{q.statement || "Sin enunciado"}</span>
                        <span className="text-gray-400 flex-shrink-0">{q.max_points} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
