"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { calculateChileanGrade, gradeColor, gradeBg } from "@/lib/grades/calculate-grade"
import type { GradingResult } from "@/types/assessment"

type ReportData = {
  studentName: string
  assessmentTitle: string
  subject: string
  gradeLevel: string
  totalScore: number
  maxScore: number
  percentage: number
  grade: number
  passed: boolean
  passingPercentage: number
  results: (GradingResult & { item_id?: string })[]
}

export default function StudentReportPage() {
  const params = useParams()
  const { id: assessmentId, submissionId } = params as { id: string; submissionId: string }
  const supabase = createClient()

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [finalizing, setFinalizing] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: sub }, { data: results }] = await Promise.all([
        supabase
          .from("submissions")
          .select("*, students(full_name), assessments(title, subject, grade_level, passing_percentage, total_points)")
          .eq("id", submissionId)
          .single(),
        supabase
          .from("grading_results")
          .select("*")
          .eq("submission_id", submissionId)
          .order("question_id"),
      ])

      if (!sub) return

      const a = (sub as any).assessments
      const totalScore = results?.reduce((s: number, r: any) =>
        s + (r.teacher_override_score ?? r.score ?? 0), 0) ?? 0
      const maxScore = results?.reduce((s: number, r: any) =>
        s + (r.max_score ?? 0), 0) ?? (a?.total_points ?? 0)

      const gradeResult = maxScore > 0
        ? calculateChileanGrade(totalScore, maxScore, a?.passing_percentage ?? 60)
        : null

      setData({
        studentName: (sub as any).students?.full_name ?? "Estudiante",
        assessmentTitle: a?.title ?? "Evaluación",
        subject: a?.subject ?? "",
        gradeLevel: a?.grade_level ?? "",
        totalScore: gradeResult?.totalScore ?? totalScore,
        maxScore: gradeResult?.maxScore ?? maxScore,
        percentage: gradeResult?.percentage ?? 0,
        grade: gradeResult?.grade ?? (sub as any).final_grade ?? 0,
        passed: gradeResult?.passed ?? ((sub as any).final_grade >= 4),
        passingPercentage: a?.passing_percentage ?? 60,
        results: results ?? [],
      })
      setLoading(false)
    }
    load()
  }, [submissionId])

  async function handleFinalize() {
    setFinalizing(true)
    const res = await fetch("/api/submissions/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId }),
    })
    const json = await res.json()
    if (json.ok) {
      setData((prev) => prev ? {
        ...prev,
        grade: json.grade,
        passed: json.passed,
        totalScore: json.totalScore,
        percentage: json.percentage,
      } : prev)
    }
    setFinalizing(false)
  }

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Cargando informe...</p>
      </div>
    )
  }

  if (!data) return null

  const gc = gradeColor(data.grade)
  const gb = gradeBg(data.grade)

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header — oculto al imprimir */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 print:hidden">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href={`/assessments/${assessmentId}`} className="text-gray-400 hover:text-gray-600 text-sm">←</a>
            <h1 className="font-semibold text-gray-900">Informe del estudiante</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="text-sm border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              {finalizing ? "Calculando..." : "↻ Recalcular nota"}
            </button>
            <button
              onClick={handlePrint}
              className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition"
            >
              Imprimir / PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 print:px-0 print:py-4">
        {/* Encabezado del informe */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5 print:rounded-none print:border-0 print:border-b print:mb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Informe de evaluación</p>
              <h2 className="text-xl font-semibold text-gray-900">{data.studentName}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {data.assessmentTitle} · {data.subject} · {data.gradeLevel}
              </p>
            </div>
            {/* Nota grande */}
            <div className={`rounded-2xl border px-6 py-4 text-center min-w-[90px] ${gb}`}>
              <p className={`text-4xl font-bold ${gc}`}>{data.grade.toFixed(1)}</p>
              <p className={`text-xs font-medium mt-0.5 ${gc}`}>{data.passed ? "Aprobado" : "Reprobado"}</p>
            </div>
          </div>

          {/* Barra de porcentaje */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-gray-500">
                {data.totalScore} / {data.maxScore} pts
              </span>
              <span className="font-medium text-gray-700">{data.percentage}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${data.passed ? "bg-green-500" : "bg-red-400"}`}
                style={{ width: `${Math.min(data.percentage, 100)}%` }}
              />
            </div>
            <div
              className="h-2.5 relative -mt-2.5"
              title={`Exigencia ${data.passingPercentage}%`}
            >
              <div
                className="absolute top-0 w-0.5 h-full bg-gray-400"
                style={{ left: `${data.passingPercentage}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Exigencia: {data.passingPercentage}% · {(data.maxScore * data.passingPercentage / 100).toFixed(1)} pts mínimos
            </p>
          </div>
        </div>

        {/* Resultados por ejercicio */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-5 print:rounded-none print:border-0 print:border-b">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-medium text-gray-900">Detalle por ejercicio</h3>
          </div>

          {data.results.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">
              No hay ejercicios corregidos aún.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Ejercicio</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Puntaje</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 print:hidden">Retroalimentación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.results.map((r, i) => {
                  const score = r.teacher_override_score ?? r.score
                  const pct = r.max_score ? ((score ?? 0) / r.max_score) * 100 : 0
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-700">
                        <p className="font-medium">Ej. {i + 1}</p>
                        <p className="text-xs text-gray-400">{r.question_id}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-medium ${pct >= 60 ? "text-green-600" : "text-red-500"}`}>
                          {score ?? "—"}
                        </span>
                        <span className="text-gray-400">/{r.max_score}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.review_status === "approved" ? "bg-green-100 text-green-700" :
                          r.review_status === "auto" ? "bg-blue-100 text-blue-700" :
                          r.review_status === "needs_review" ? "bg-amber-100 text-amber-700" :
                          r.review_status === "manual_required" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {{ auto: "Auto", approved: "Aprobado", needs_review: "Revisar",
                             manual_required: "Manual", pending: "Pendiente" }[r.review_status] ?? r.review_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 print:hidden">
                        {r.student_feedback
                          ? <p className="text-xs leading-relaxed line-clamp-2">{r.student_feedback}</p>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-5 py-3 font-semibold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">
                    {data.totalScore}/{data.maxScore}
                  </td>
                  <td colSpan={2} className="px-4 py-3 text-center text-sm text-gray-500">
                    {data.percentage}% · Nota {data.grade.toFixed(1)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Retroalimentación completa (para impresión) */}
        {data.results.some(r => r.student_feedback) && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 print:rounded-none print:border-0">
            <h3 className="font-medium text-gray-900 mb-4">Retroalimentación por ejercicio</h3>
            <div className="space-y-4">
              {data.results.filter(r => r.student_feedback).map((r, i) => (
                <div key={r.id}>
                  <p className="text-xs font-medium text-gray-500 mb-1">Ejercicio {i + 1} — {r.question_id}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{r.student_feedback}</p>
                  {r.errors_detected?.length ? (
                    <ul className="mt-1 space-y-0.5">
                      {r.errors_detected.map((e, j) => (
                        <li key={j} className="text-xs text-red-600">• {e}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
