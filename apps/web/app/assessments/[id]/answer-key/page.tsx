"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { ParsedAssessmentStructure, ParsedAssessmentQuestion } from "@/types/assessment"

export default function AnswerKeyPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const supabase = createClient()

  const [structure, setStructure] = useState<ParsedAssessmentStructure | null>(null)
  const [title, setTitle] = useState("")
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("assessments")
        .select("title, official_test_json, answer_key_json")
        .eq("id", id)
        .single()
      if (!data) return
      setTitle(data.title)
      setStructure(data.official_test_json as ParsedAssessmentStructure)
      if (data.answer_key_json) {
        setAnswers(data.answer_key_json as Record<string, string>)
      }
    }
    load()
  }, [id])

  async function save() {
    setSaving(true)
    await supabase
      .from("assessments")
      .update({ answer_key_json: answers })
      .eq("id", id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function setAnswer(questionId: string, value: string) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const allQuestions: ParsedAssessmentQuestion[] = structure?.items?.flatMap(i => i.questions) ?? []
  const mc = allQuestions.filter(q => q.question_type === "multiple_choice")
  const tf = allQuestions.filter(q => q.question_type === "true_false")

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
            <div>
              <h1 className="font-semibold text-gray-900">Clave de corrección</h1>
              <p className="text-xs text-gray-400 truncate max-w-xs">{title}</p>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className={`text-sm px-5 py-2 rounded-lg font-medium transition ${saved ? "bg-green-600 text-white" : "bg-gray-900 text-white hover:bg-gray-800"} disabled:opacity-50`}
          >
            {saved ? "✓ Guardado" : saving ? "Guardando..." : "Guardar clave"}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {!structure ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
            Primero debes analizar el PDF oficial para detectar la estructura.
          </div>
        ) : (
          <>
            {/* Selección múltiple */}
            {mc.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-blue-50">
                  <h2 className="font-medium text-blue-900">Selección Múltiple — Respuestas correctas</h2>
                  <p className="text-xs text-blue-600 mt-0.5">Ingresa la letra correcta para cada pregunta</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {mc.map((q, i) => (
                    <div key={q.question_id} className="flex items-start gap-4 px-5 py-4">
                      <div className="text-sm font-medium text-gray-500 min-w-[28px] pt-0.5">{i + 1}.</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 mb-2 line-clamp-2">{q.statement}</p>
                        <div className="flex gap-2 flex-wrap">
                          {(q.alternatives?.length ? q.alternatives.map(a => a.label) : ["a","b","c","d","e"]).map(label => (
                            <button
                              key={label}
                              onClick={() => setAnswer(q.question_id, label)}
                              className={`w-9 h-9 rounded-full text-sm font-semibold border-2 transition ${
                                answers[q.question_id] === label
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600"
                              }`}
                            >
                              {label.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verdadero/Falso */}
            {tf.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-amber-50">
                  <h2 className="font-medium text-amber-900">Verdadero y Falso — Respuestas correctas</h2>
                  <p className="text-xs text-amber-600 mt-0.5">Selecciona V o F para cada afirmación</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {tf.map((q, i) => (
                    <div key={q.question_id} className="flex items-center gap-4 px-5 py-3">
                      <div className="text-sm font-medium text-gray-500 min-w-[28px]">{i + 1}.</div>
                      <p className="text-sm text-gray-700 flex-1 min-w-0 truncate">{q.statement}</p>
                      <div className="flex gap-2 flex-shrink-0">
                        {["V", "F"].map(label => (
                          <button
                            key={label}
                            onClick={() => setAnswer(q.question_id, label)}
                            className={`w-10 h-9 rounded-lg text-sm font-bold border-2 transition ${
                              answers[q.question_id] === label
                                ? label === "V"
                                  ? "bg-green-600 text-white border-green-600"
                                  : "bg-red-500 text-white border-red-500"
                                : "border-gray-200 text-gray-500 hover:border-gray-400"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Desarrollo — solo informativo */}
            {allQuestions.filter(q => q.question_type === "development").length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <p className="text-sm font-medium text-gray-700 mb-1">Preguntas de desarrollo</p>
                <p className="text-sm text-gray-500">
                  Los ejercicios de desarrollo son corregidos por la IA usando la rúbrica y el criterio del docente. No requieren clave de alternativas.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="bg-gray-900 text-white text-sm px-6 py-2.5 rounded-xl font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar clave de corrección →"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
