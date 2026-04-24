"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { GradingResult } from "@/types/assessment"

type PageWithResult = {
  id: string
  question_id: string
  item_id: string
  image_path: string
  ocr_status: string
  grading_results: GradingResult | null
}

export default function ReviewPage() {
  const params = useParams()
  const { id: assessmentId, submissionId } = params as { id: string; submissionId: string }
  const supabase = createClient()

  const [pages, setPages] = useState<PageWithResult[]>([])
  const [studentName, setStudentName] = useState("")
  const [selected, setSelected] = useState<PageWithResult | null>(null)
  const [overrideScore, setOverrideScore] = useState<string>("")
  const [overrideNote, setOverrideNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: sub } = await supabase
        .from("submissions")
        .select("*, students(full_name)")
        .eq("id", submissionId)
        .single()
      setStudentName((sub as any)?.students?.full_name ?? "Estudiante")

      const { data: pgs } = await supabase
        .from("submission_pages")
        .select("*, grading_results(*)")
        .eq("submission_id", submissionId)
        .order("upload_order")
      setPages(pgs ?? [])
      if (pgs?.length) setSelected(pgs[0])
    }
    load()
  }, [submissionId])

  useEffect(() => {
    if (!selected) return
    setOverrideScore(selected.grading_results?.teacher_override_score?.toString() ?? selected.grading_results?.score?.toString() ?? "")
    setOverrideNote(selected.grading_results?.teacher_override_note ?? "")

    // Obtener URL firmada de la imagen
    async function getUrl() {
      const { data } = await supabase.storage
        .from("submission-images")
        .createSignedUrl(selected!.image_path, 300)
      setImageUrl(data?.signedUrl ?? null)
    }
    getUrl()
  }, [selected])

  async function saveOverride() {
    if (!selected?.grading_results) return
    setSaving(true)
    const score = parseFloat(overrideScore)
    await supabase
      .from("grading_results")
      .update({
        teacher_override_score: isNaN(score) ? null : score,
        teacher_override_note: overrideNote,
        review_status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", selected.grading_results.id)

    // Refrescar
    const { data } = await supabase
      .from("submission_pages")
      .select("*, grading_results(*)")
      .eq("submission_id", submissionId)
      .order("upload_order")
    setPages(data ?? [])
    const updated = data?.find((p) => p.id === selected.id) ?? null
    setSelected(updated)
    setSaving(false)
  }

  async function triggerCorrection(page: PageWithResult) {
    if (!page.image_path) return
    const { data: signedUrl } = await supabase.storage
      .from("submission-images")
      .createSignedUrl(page.image_path, 3600)
    if (!signedUrl?.signedUrl) return

    await fetch("/api/correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId,
        assessmentId,
        questionId: page.question_id,
        imageUrl: signedUrl.signedUrl,
        subject: "math",
        maxPoints: 2,
        questionStatement: "",
        rubric: {},
      }),
    })

    const { data: pgs } = await supabase
      .from("submission_pages")
      .select("*, grading_results(*)")
      .eq("submission_id", submissionId)
      .order("upload_order")
    setPages(pgs ?? [])
    const updated = pgs?.find((p) => p.id === page.id) ?? null
    setSelected(updated)
  }

  const gr = selected?.grading_results
  const finalScore = gr?.teacher_override_score ?? gr?.score

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <a href={`/assessments/${assessmentId}`} className="text-gray-400 hover:text-gray-600 text-sm">←</a>
          <div>
            <h1 className="font-semibold text-gray-900">Revisión — {studentName}</h1>
            <p className="text-xs text-gray-400">{pages.length} ejercicios</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 flex gap-6">
        {/* Lista ejercicios */}
        <div className="w-56 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {pages.map((p, i) => {
              const r = p.grading_results
              const status = r?.review_status ?? "pending"
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-0 transition ${
                    selected?.id === p.id ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    status === "approved" ? "bg-green-500" :
                    status === "needs_review" ? "bg-amber-400" :
                    status === "auto" ? "bg-blue-400" :
                    status === "manual_required" ? "bg-red-400" : "bg-gray-300"
                  }`} />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 truncate">{p.item_id}</p>
                    <p className="text-sm text-gray-800">Ej. {i + 1}</p>
                  </div>
                  {r?.score != null && (
                    <span className="ml-auto text-xs font-medium text-gray-600">
                      {finalScore ?? r.score}/{r.max_score}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel principal */}
        {selected && (
          <div className="flex-1 space-y-4">
            {/* Imagen */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Respuesta del estudiante"
                  className="w-full max-h-96 object-contain bg-gray-50"
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
                  Cargando imagen...
                </div>
              )}
            </div>

            {/* Resultado IA */}
            {gr ? (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">Corrección IA</h3>
                  <div className="flex items-center gap-2">
                    {gr.ocr_provider && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        {gr.ocr_provider}
                      </span>
                    )}
                    {gr.ocr_confidence != null && (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        gr.ocr_confidence > 0.75 ? "bg-green-100 text-green-700" :
                        gr.ocr_confidence > 0.45 ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {Math.round(gr.ocr_confidence * 100)}% confianza
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      gr.review_status === "approved" ? "bg-green-100 text-green-700" :
                      gr.review_status === "needs_review" ? "bg-amber-100 text-amber-700" :
                      gr.review_status === "manual_required" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {{ auto: "Auto", needs_review: "Revisar", manual_required: "Manual", approved: "Aprobado", pending: "Pendiente" }[gr.review_status] ?? gr.review_status}
                    </span>
                  </div>
                </div>

                {/* Texto OCR */}
                {gr.ocr_text && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Texto detectado (OCR)</p>
                    <pre className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono">
                      {gr.ocr_text}
                    </pre>
                  </div>
                )}

                {/* Puntaje IA */}
                <div className="flex items-center gap-6 py-3 border-y border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Puntaje IA</p>
                    <p className="text-xl font-bold text-gray-900">
                      {gr.score ?? "—"}/{gr.max_score ?? "—"}
                    </p>
                  </div>
                  {gr.teacher_override_score != null && (
                    <div>
                      <p className="text-xs text-gray-500">Puntaje docente</p>
                      <p className="text-xl font-bold text-blue-600">
                        {gr.teacher_override_score}/{gr.max_score}
                      </p>
                    </div>
                  )}
                </div>

                {/* Retroalimentación */}
                {gr.student_feedback && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Retroalimentación</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{gr.student_feedback}</p>
                  </div>
                )}

                {/* Errores */}
                {gr.errors_detected && gr.errors_detected.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Errores detectados</p>
                    <ul className="space-y-1">
                      {gr.errors_detected.map((e, i) => (
                        <li key={i} className="text-sm text-red-600 flex gap-2">
                          <span>•</span>{e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Override del docente */}
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">Ajuste manual (opcional)</p>
                  <div className="flex gap-3">
                    <div className="w-32">
                      <label className="text-xs text-gray-500 mb-1 block">Puntaje</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max={gr.max_score ?? 10}
                        value={overrideScore}
                        onChange={(e) => setOverrideScore(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Nota del docente</label>
                      <input
                        type="text"
                        value={overrideNote}
                        onChange={(e) => setOverrideNote(e.target.value)}
                        placeholder="Razón del ajuste..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={saveOverride}
                    disabled={saving}
                    className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "✓ Aprobar corrección"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                <p className="text-sm text-gray-500 mb-4">
                  Este ejercicio aún no ha sido corregido por la IA.
                </p>
                <button
                  onClick={() => triggerCorrection(selected)}
                  className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  Corregir con IA →
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
