"use client"

import { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { Assessment, ParsedAssessmentStructure } from "@/types/assessment"

type UploadStatus = "pending" | "uploading" | "done" | "error"

type ExerciseSlot = {
  itemId: string
  itemLabel: string
  questionId: string
  statement: string
  maxPoints: number
  status: UploadStatus
  imagePath?: string
}

export default function UploadPage() {
  const params = useParams()
  const assessmentId = params.id as string
  const supabase = createClient()

  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [studentName, setStudentName] = useState("")
  const [studentId, setStudentId] = useState<string | null>(null)
  const [slots, setSlots] = useState<ExerciseSlot[]>([])
  const [currentSlot, setCurrentSlot] = useState(0)
  const [step, setStep] = useState<"student" | "upload" | "done">("student")
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("assessments")
        .select("*")
        .eq("id", assessmentId)
        .single()
      setAssessment(data)

      if (data?.official_test_json) {
        const structure = data.official_test_json as ParsedAssessmentStructure
        const built: ExerciseSlot[] = []
        for (const item of structure.items ?? []) {
          for (const q of item.questions) {
            built.push({
              itemId: item.item_id,
              itemLabel: item.label,
              questionId: q.question_id,
              statement: q.statement,
              maxPoints: q.max_points,
              status: "pending",
            })
          }
        }
        setSlots(built)
      }
    }
    load()
  }, [assessmentId])

  async function createStudent() {
    setError(null)
    if (!studentName.trim()) { setError("Ingresa el nombre del estudiante"); return }

    // Buscar o crear estudiante
    let sid: string
    const { data: existing } = await supabase
      .from("students")
      .select("id")
      .ilike("full_name", studentName.trim())
      .limit(1)
      .single()

    if (existing) {
      sid = existing.id
    } else {
      const { data: created } = await supabase
        .from("students")
        .insert({ full_name: studentName.trim() })
        .select("id")
        .single()
      sid = created!.id
    }

    // Crear submission
    const { data: submission } = await supabase
      .from("submissions")
      .insert({
        assessment_id: assessmentId,
        student_id: sid,
        status: "pending",
        grading_status: "pending",
      })
      .select("id")
      .single()

    setStudentId(submission!.id)
    setStep("upload")
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !studentId) return

    const slot = slots[currentSlot]
    updateSlot(currentSlot, { status: "uploading" })
    setError(null)

    try {
      const path = `submissions/${studentId}/${slot.questionId}.jpg`
      const { error: uploadError } = await supabase.storage
        .from("submission-images")
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      // Registrar en submission_pages
      await supabase.from("submission_pages").insert({
        submission_id: studentId,
        assessment_id: assessmentId,
        item_id: slot.itemId,
        question_id: slot.questionId,
        image_path: path,
        upload_order: currentSlot,
        capture_mode: "photo",
        ocr_status: "pending",
      })

      updateSlot(currentSlot, { status: "done", imagePath: path })

      // Avanzar al siguiente ejercicio
      if (currentSlot < slots.length - 1) {
        setCurrentSlot(currentSlot + 1)
      } else {
        // Todos subidos → marcar submission como lista para corrección
        await supabase
          .from("submissions")
          .update({ status: "processing" })
          .eq("id", studentId)
        setStep("done")
      }
    } catch (e) {
      updateSlot(currentSlot, { status: "error" })
      setError(e instanceof Error ? e.message : "Error al subir imagen")
    }

    // Limpiar input para poder re-usar
    if (fileRef.current) fileRef.current.value = ""
  }

  function updateSlot(idx: number, patch: Partial<ExerciseSlot>) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function skipSlot() {
    updateSlot(currentSlot, { status: "error" })
    if (currentSlot < slots.length - 1) setCurrentSlot(currentSlot + 1)
  }

  if (!assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  // ── VISTA: NOMBRE DEL ESTUDIANTE ────────────────────────────────────────────
  if (step === "student") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6">
          <a href={`/assessments/${assessmentId}`} className="text-gray-400 text-sm hover:text-gray-600">
            ←
          </a>
          <h1 className="text-lg font-semibold text-gray-900 mt-3">Nombre del estudiante</h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">{assessment.title}</p>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createStudent()}
            placeholder="Nombre completo"
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {slots.length === 0 && (
            <div className="bg-amber-50 text-amber-700 text-sm px-4 py-3 rounded-lg mb-4">
              Esta evaluación no tiene estructura detectada. Analiza el PDF oficial primero.
            </div>
          )}

          <button
            onClick={createStudent}
            disabled={slots.length === 0}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            Comenzar subida →
          </button>
        </div>
      </div>
    )
  }

  // ── VISTA: DONE ─────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-lg font-semibold text-gray-900">¡Subida completa!</h1>
          <p className="text-sm text-gray-500 mt-2 mb-6">
            Todos los ejercicios de <strong>{studentName}</strong> fueron enviados.
            El sistema iniciará la corrección automática.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setStep("student"); setStudentName(""); setStudentId(null); setCurrentSlot(0); setSlots(s => s.map(x => ({...x, status: "pending", imagePath: undefined}))) }}
              className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Otro estudiante
            </button>
            <a
              href={`/assessments/${assessmentId}`}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition text-center"
            >
              Ver evaluación
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── VISTA: SUBIDA GUIADA ─────────────────────────────────────────────────────
  const slot = slots[currentSlot]
  const done = slots.filter((s) => s.status === "done").length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Subida guiada</p>
            <h1 className="font-semibold text-gray-900">{studentName}</h1>
          </div>
          <div className="text-sm text-gray-500">
            {done}/{slots.length} ejercicios
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Progreso */}
        <div className="flex gap-1.5 mb-8 flex-wrap">
          {slots.map((s, i) => (
            <div
              key={s.questionId}
              onClick={() => s.status !== "uploading" && setCurrentSlot(i)}
              className={`h-2 flex-1 min-w-[20px] rounded-full cursor-pointer transition ${
                i === currentSlot
                  ? "bg-blue-600"
                  : s.status === "done"
                  ? "bg-green-500"
                  : s.status === "error"
                  ? "bg-red-400"
                  : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Ejercicio actual */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
              {slot.itemLabel}
            </span>
            <span className="text-xs text-gray-400">{slot.maxPoints} pts</span>
          </div>
          <p className="text-gray-900 font-medium mt-2 mb-1 text-sm">
            Ejercicio {currentSlot + 1} de {slots.length}
          </p>
          <p className="text-gray-600 text-sm leading-relaxed">
            {slot.statement || "Sube la foto de este ejercicio"}
          </p>

          {slot.status === "done" && (
            <div className="mt-4 bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg">
              ✓ Imagen subida correctamente
            </div>
          )}
          {error && slot.status === "error" && (
            <div className="mt-4 bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Botones */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          id="camera-input"
        />

        {slot.status !== "done" ? (
          <div className="flex gap-3">
            <label
              htmlFor="camera-input"
              className={`flex-1 text-center py-3.5 rounded-xl text-sm font-medium cursor-pointer transition ${
                slot.status === "uploading"
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {slot.status === "uploading" ? "Subiendo..." : "📷 Tomar foto"}
            </label>
            <button
              onClick={skipSlot}
              disabled={slot.status === "uploading"}
              className="px-5 py-3.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Saltar
            </button>
          </div>
        ) : currentSlot < slots.length - 1 ? (
          <button
            onClick={() => setCurrentSlot(currentSlot + 1)}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
          >
            Siguiente ejercicio →
          </button>
        ) : (
          <button
            onClick={async () => {
              await supabase.from("submissions").update({ status: "processing" }).eq("id", studentId)
              setStep("done")
            }}
            className="w-full bg-green-600 text-white py-3.5 rounded-xl text-sm font-medium hover:bg-green-700 transition"
          >
            ✓ Finalizar subida
          </button>
        )}

        {/* Lista de ejercicios */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
            Todos los ejercicios
          </div>
          {slots.map((s, i) => (
            <div
              key={s.questionId}
              onClick={() => s.status !== "uploading" && setCurrentSlot(i)}
              className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition border-b border-gray-50 last:border-0 ${
                i === currentSlot ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                  s.status === "done"
                    ? "bg-green-500 text-white"
                    : s.status === "error"
                    ? "bg-red-400 text-white"
                    : i === currentSlot
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {s.status === "done" ? "✓" : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">{s.itemLabel}</p>
                <p className="text-sm text-gray-700 truncate">{s.statement || "Ejercicio " + (i + 1)}</p>
              </div>
              <span className="text-xs text-gray-400">{s.maxPoints} pts</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
