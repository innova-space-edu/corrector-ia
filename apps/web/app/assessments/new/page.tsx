"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { ParsedAssessmentStructure } from "@/types/assessment"

const SUBJECTS = [
  { value: "math", label: "Matemática" },
  { value: "language", label: "Lenguaje" },
  { value: "science", label: "Ciencias" },
  { value: "history", label: "Historia" },
  { value: "english", label: "Inglés" },
]

type Step = "form" | "uploading" | "parsing" | "review"

export default function NewAssessmentPage() {
  const supabase = createClient()
  const [step, setStep] = useState<Step>("form")
  const [error, setError] = useState<string | null>(null)

  // Formulario
  const [title, setTitle] = useState("")
  const [subject, setSubject] = useState("math")
  const [gradeLevel, setGradeLevel] = useState("")
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  // Resultado del parser
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedAssessmentStructure | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!title.trim()) { setError("El título es obligatorio"); return }
    if (!pdfFile) { setError("Debes subir la prueba oficial en PDF"); return }

    setStep("uploading")

    try {
      // 1. Crear la evaluación en Supabase
      // Obtener usuario logueado
const {
  data: { user },
} = await supabase.auth.getUser()

if (!user) throw new Error("Usuario no autenticado")

const { data: assessment, error: createError } = await supabase
  .from("assessments")
  .insert({
    title,
    subject,
    grade_level: gradeLevel,
    status: "draft",
    teacher_id: user.id, // 🔥 CLAVE
  })
  .select()
  .single()

      if (createError || !assessment) throw new Error(createError?.message ?? "Error al crear evaluación")
      setAssessmentId(assessment.id)

      // 2. Subir PDF
      const uploadForm = new FormData()
      uploadForm.append("file", pdfFile)
      uploadForm.append("assessmentId", assessment.id)

      const uploadRes = await fetch("/api/assessments/upload-pdf", {
        method: "POST",
        body: uploadForm,
      })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error)

      // 3. Parsear PDF con IA
      setStep("parsing")
      const parseRes = await fetch("/api/assessments/parse-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: assessment.id, filePath: uploadData.filePath }),
      })
      const parseData = await parseRes.json()
      if (!parseRes.ok) throw new Error(parseData.error)

      setParsed(parseData.parsedStructure)
      setStep("review")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado")
      setStep("form")
    }
  }

  async function handleConfirm() {
    if (!assessmentId) return
    // Activar la evaluación
    await supabase.from("assessments").update({ status: "active" }).eq("id", assessmentId)
    window.location.href = `/assessments/${assessmentId}`
  }

  // ─── VISTA: REVISIÓN DE ESTRUCTURA DETECTADA ────────────────────────────────
  if (step === "review" && parsed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-xl font-semibold text-gray-900">Estructura detectada</h1>
            <p className="text-sm text-gray-500">Revisa que sea correcta antes de continuar</p>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {/* Resumen */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 text-lg">
                  {parsed.assessment_title ?? title}
                </h2>
                {parsed.total_points && (
                  <p className="text-sm text-gray-500 mt-1">
                    Puntaje total: <strong>{parsed.total_points} pts</strong>
                  </p>
                )}
              </div>
              <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {parsed.items.length} ítems detectados
              </span>
            </div>
            {parsed.grading_rules && parsed.grading_rules.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs font-medium text-blue-700 mb-1">Reglas de puntaje:</p>
                {parsed.grading_rules.map((r, i) => (
                  <p key={i} className="text-sm text-blue-600">• {r}</p>
                ))}
              </div>
            )}
          </div>

          {/* Ítems */}
          <div className="space-y-4">
            {parsed.items.map((item) => (
              <div key={item.item_id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">{item.label}</h3>
                  {item.points_rule && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {item.points_rule}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {item.questions.map((q) => (
                    <div key={q.question_id} className="flex items-start gap-3 pl-3">
                      <span className="text-xs text-gray-400 mt-0.5 min-w-[60px]">
                        {q.max_points} pts
                      </span>
                      <p className="text-sm text-gray-700 flex-1">{q.statement || "Sin enunciado"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Acciones */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition"
            >
              ✓ Confirmar y activar evaluación
            </button>
            <button
              onClick={() => { setStep("form"); setParsed(null) }}
              className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition"
            >
              Volver
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ─── VISTA: FORMULARIO ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-gray-600">←</a>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Nueva evaluación</h1>
            <p className="text-sm text-gray-500">Sube la prueba oficial para analizar su estructura</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Título de la evaluación
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Prueba Unidad 1 — Números racionales"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Asignatura</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SUBJECTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nivel</label>
              <input
                type="text"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                placeholder="Ej: 8°"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Prueba oficial (PDF)
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-400 transition">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                className="hidden"
                id="pdf-upload"
              />
              <label htmlFor="pdf-upload" className="cursor-pointer">
                {pdfFile ? (
                  <div>
                    <p className="text-sm font-medium text-blue-600">{pdfFile.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-500">Haz clic para subir el PDF</p>
                    <p className="text-xs text-gray-400 mt-1">Máximo 50MB</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={step !== "form"}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {step === "uploading" && "Subiendo PDF..."}
            {step === "parsing" && "Analizando estructura con IA..."}
            {step === "form" && "Analizar prueba oficial →"}
          </button>
        </div>
      </main>
    </div>
  )
}
