"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { gradeColor } from "@/lib/grades/calculate-grade"

type StudentData = {
  id: string
  full_name: string
  rut?: string
}

type SubmissionWithAssessment = {
  id: string
  final_grade?: number
  total_score?: number
  max_score?: number
  percentage?: number
  grading_status: string
  submitted_at: string
  assessments: { title: string; subject: string; grade_level?: string } | null
}

type StudentMemory = {
  recurring_errors?: string[]
  weak_topics?: string[]
  strong_topics?: string[]
  improvement_trend?: string
  last_updated?: string
}

const TREND_ICON: Record<string, string> = {
  mejorando: "↑", estable: "→", bajando: "↓",
}
const TREND_COLOR: Record<string, string> = {
  mejorando: "text-green-600", estable: "text-gray-500", bajando: "text-red-500",
}
const STATUS_LABEL: Record<string, string> = {
  completed: "Corregido", pending: "Pendiente", needs_review: "Revisar", partial: "Parcial",
}

export default function StudentProfilePage() {
  const params = useParams()
  const studentId = params.id as string
  const supabase = createClient()

  const [student, setStudent] = useState<StudentData | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionWithAssessment[]>([])
  const [memory, setMemory] = useState<StudentMemory | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingMemory, setGeneratingMemory] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: s }, { data: subs }, { data: mem }] = await Promise.all([
        supabase.from("students").select("*").eq("id", studentId).single(),
        supabase
          .from("submissions")
          .select("id, final_grade, total_score, max_score, percentage, grading_status, submitted_at, assessments(title, subject, grade_level)")
          .eq("student_id", studentId)
          .order("submitted_at", { ascending: false }),
        supabase.from("student_memory").select("*").eq("student_id", studentId).single(),
      ])
      setStudent(s)
      setSubmissions(subs ?? [])
      setMemory(mem)
      setLoading(false)
    }
    load()
  }, [studentId])

  async function generateMemory() {
    setGeneratingMemory(true)
    const res = await fetch(`/api/students/${studentId}/memory`, { method: "POST" })
    const json = await res.json()
    if (json.ok) {
      const { data } = await supabase
        .from("student_memory")
        .select("*")
        .eq("student_id", studentId)
        .single()
      setMemory(data)
    }
    setGeneratingMemory(false)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">Cargando...</p></div>
  }

  if (!student) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">Estudiante no encontrado.</p></div>
  }

  const grades = submissions.map(s => s.final_grade).filter((g): g is number => g != null)
  const avgGrade = grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length) : null
  const passRate = grades.length ? (grades.filter(g => g >= 4).length / grades.length) * 100 : null
  const trend = memory?.improvement_trend ?? "estable"

  const subjectCount: Record<string, number> = {}
  for (const s of submissions) {
    const sub = s.assessments?.subject ?? "otro"
    subjectCount[sub] = (subjectCount[sub] ?? 0) + 1
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={() => history.back()} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
          <div className="flex items-center gap-4 flex-1">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg flex-shrink-0">
              {student.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 text-lg">{student.full_name}</h1>
              {student.rut && <p className="text-xs text-gray-400">RUT: {student.rut}</p>}
            </div>
            {trend !== "estable" && (
              <span className={`ml-auto text-2xl font-bold ${TREND_COLOR[trend] ?? "text-gray-500"}`}>
                {TREND_ICON[trend]}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Evaluaciones", value: submissions.length },
            { label: "Promedio", value: avgGrade?.toFixed(1) ?? "—" },
            { label: "% Aprobación", value: passRate != null ? `${Math.round(passRate)}%` : "—" },
            { label: "Tendencia", value: { mejorando: "Mejorando", estable: "Estable", bajando: "Bajando" }[trend] ?? trend },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className={`text-2xl font-bold ${s.label === "Promedio" && avgGrade ? gradeColor(avgGrade) : "text-gray-900"}`}>
                {s.value}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-5">
          {/* Memoria IA */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Perfil de aprendizaje</h3>
                <button
                  onClick={generateMemory}
                  disabled={generatingMemory}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                >
                  {generatingMemory ? "Analizando..." : "↻ Actualizar"}
                </button>
              </div>

              {!memory ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400 mb-3">Sin análisis generado aún.</p>
                  <button
                    onClick={generateMemory}
                    disabled={generatingMemory}
                    className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {generatingMemory ? "Analizando..." : "Generar análisis IA"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {memory.weak_topics && memory.weak_topics.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Temas a reforzar</p>
                      <div className="flex flex-wrap gap-1.5">
                        {memory.weak_topics.map(t => (
                          <span key={t} className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {memory.strong_topics && memory.strong_topics.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Fortalezas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {memory.strong_topics.map(t => (
                          <span key={t} className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {memory.recurring_errors && memory.recurring_errors.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Errores frecuentes</p>
                      <ul className="space-y-1">
                        {memory.recurring_errors.slice(0, 4).map(e => (
                          <li key={e} className="text-xs text-gray-600 flex gap-2"><span className="text-red-400">•</span>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {memory.last_updated && (
                    <p className="text-xs text-gray-400 border-t border-gray-100 pt-2 mt-2">
                      Actualizado: {new Date(memory.last_updated).toLocaleDateString("es-CL")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Asignaturas */}
            {Object.keys(subjectCount).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-medium text-gray-900 mb-3">Por asignatura</h3>
                <div className="space-y-2">
                  {Object.entries(subjectCount).map(([subj, count]) => (
                    <div key={subj} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 capitalize">{subj}</span>
                      <span className="text-gray-400">{count} eval.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Historial de evaluaciones */}
          <div className="col-span-3">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-medium text-gray-900">Historial de evaluaciones</h3>
              </div>
              {submissions.length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-400 text-sm">Sin evaluaciones.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {submissions.map(s => (
                    <div key={s.id} className="px-5 py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {s.assessments?.title ?? "—"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {s.assessments?.subject ?? "—"} · {new Date(s.submitted_at).toLocaleDateString("es-CL")}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {s.final_grade != null ? (
                          <p className={`text-lg font-bold ${gradeColor(s.final_grade)}`}>
                            {s.final_grade.toFixed(1)}
                          </p>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {STATUS_LABEL[s.grading_status] ?? s.grading_status}
                          </span>
                        )}
                        {s.total_score != null && (
                          <p className="text-xs text-gray-400">{s.total_score}/{s.max_score} pts</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
