"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { GradingResult, ParsedAssessmentStructure, ParsedAssessmentQuestion } from "@/types/assessment"

type PageWithResult = {
  id: string; question_id: string; item_id: string
  image_path: string; ocr_status: string; grading_results: GradingResult | null
}

const RS_LABEL: Record<string,string> = { auto:"Auto", approved:"Aprobado", needs_review:"Revisar", manual_required:"Manual", pending:"Pendiente" }
const RS_COLOR: Record<string,string> = { auto:"bg-blue-100 text-blue-700", approved:"bg-green-100 text-green-700", needs_review:"bg-amber-100 text-amber-700", manual_required:"bg-red-100 text-red-700", pending:"bg-gray-100 text-gray-500" }
const QT_LABEL: Record<string,string> = { multiple_choice:"Selección múltiple", true_false:"Verdadero/Falso", development:"Desarrollo", fill_blank:"Completar" }
const QT_COLOR: Record<string,string> = { multiple_choice:"bg-blue-50 text-blue-700", true_false:"bg-amber-50 text-amber-700", development:"bg-purple-50 text-purple-700" }

export default function ReviewPage() {
  const params = useParams()
  const { id: assessmentId, submissionId } = params as { id: string; submissionId: string }
  const supabase = createClient()

  const [pages, setPages] = useState<PageWithResult[]>([])
  const [studentName, setStudentName] = useState("")
  const [structure, setStructure] = useState<ParsedAssessmentStructure | null>(null)
  const [answerKey, setAnswerKey] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<PageWithResult | null>(null)
  const [selectedQuestion, setSelectedQuestion] = useState<ParsedAssessmentQuestion | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [overrideScore, setOverrideScore] = useState("")
  const [overrideNote, setOverrideNote] = useState("")
  const [correctedOcr, setCorrectedOcr] = useState("")
  const [saving, setSaving] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: sub }, { data: pgs }, { data: assessment }] = await Promise.all([
        supabase.from("submissions").select("*, students(full_name)").eq("id", submissionId).single(),
        supabase.from("submission_pages").select("*, grading_results(*)").eq("submission_id", submissionId).order("upload_order"),
        supabase.from("assessments").select("official_test_json, answer_key_json").eq("id", assessmentId).single(),
      ])
      setStudentName((sub as any)?.students?.full_name ?? "Estudiante")
      setPages(pgs ?? [])
      setStructure(assessment?.official_test_json as ParsedAssessmentStructure)
      setAnswerKey((assessment?.answer_key_json as Record<string, string>) ?? {})
      if (pgs?.length) setSelected(pgs[0])
    }
    load()
  }, [submissionId, assessmentId])

  useEffect(() => {
    if (!selected) return
    const gr = selected.grading_results
    setOverrideScore(gr?.teacher_override_score?.toString() ?? gr?.score?.toString() ?? "")
    setOverrideNote(gr?.teacher_override_note ?? "")
    setCorrectedOcr(gr?.ocr_text ?? "")
    setShowFeedback(false)
    const allQs = structure?.items?.flatMap(i => i.questions) ?? []
    setSelectedQuestion(allQs.find(q => q.question_id === selected.question_id) ?? null)
    async function getUrl() {
      const { data } = await supabase.storage.from("submission-images").createSignedUrl(selected!.image_path, 600)
      setImageUrl(data?.signedUrl ?? null)
    }
    getUrl()
  }, [selected, structure])

  const reload = useCallback(async () => {
    const { data } = await supabase.from("submission_pages").select("*, grading_results(*)").eq("submission_id", submissionId).order("upload_order")
    setPages(data ?? [])
    setSelected(data?.find(p => p.id === selected?.id) ?? null)
  }, [submissionId, selected?.id])

  async function handleCorrect() {
    if (!selected || !imageUrl) return
    setCorrecting(true)
    const q = selectedQuestion
    await fetch("/api/correct/smart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId, assessmentId, questionId: selected.question_id, imageUrl,
        questionType: q?.question_type ?? "development", maxPoints: q?.max_points ?? 2,
        questionStatement: q?.statement ?? "", alternatives: q?.alternatives ?? [],
        correctAnswer: answerKey[selected.question_id] ?? null, subject: "math", rubric: {},
      }),
    })
    await reload()
    setCorrecting(false)
  }

  async function saveOverride() {
    if (!selected?.grading_results) return
    setSaving(true)
    const s = parseFloat(overrideScore)
    await supabase.from("grading_results").update({ teacher_override_score: isNaN(s) ? null : s, teacher_override_note: overrideNote, review_status: "approved", reviewed_at: new Date().toISOString() }).eq("id", selected.grading_results.id)
    await reload()
    setSaving(false)
  }

  async function saveOcrFeedback() {
    const gr = selected?.grading_results
    if (!gr) return
    await fetch("/api/ocr-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId, questionId: selected!.question_id, imageUrl: selected!.image_path, ocrText: gr.ocr_text ?? "", correctedText: correctedOcr, errorType: "lectura_incorrecta", ocrProvider: gr.ocr_provider, confidenceAtTime: gr.ocr_confidence, subject: "math" }) })
    setShowFeedback(false)
    alert("✓ Corrección OCR guardada. El sistema aprenderá de este ejemplo.")
  }

  const gr = selected?.grading_results
  const finalScore = gr?.teacher_override_score ?? gr?.score
  const hasKey = selected ? !!answerKey[selected.question_id] : false

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <a href={`/assessments/${assessmentId}`} className="text-gray-400 hover:text-gray-600 text-sm">←</a>
          <div>
            <h1 className="font-semibold text-gray-900">Revisión — {studentName}</h1>
            <p className="text-xs text-gray-400">{pages.length} ejercicios · <a href={`/assessments/${assessmentId}/answer-key`} className="text-blue-500 hover:underline">Editar clave</a></p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 flex gap-5">
        <div className="w-52 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {pages.map((p, i) => {
              const r = p.grading_results; const status = r?.review_status ?? "pending"
              return (
                <button key={p.id} onClick={() => setSelected(p)} className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-0 transition ${selected?.id === p.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status==="approved"?"bg-green-500":status==="needs_review"?"bg-amber-400":status==="auto"?"bg-blue-400":status==="manual_required"?"bg-red-400":"bg-gray-300"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400">{p.item_id}</p>
                    <p className="text-sm text-gray-800">Ej. {i + 1}</p>
                  </div>
                  {r?.score != null && <span className="text-xs font-medium text-gray-600">{finalScore ?? r.score}/{r.max_score}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {selected && (
          <div className="flex-1 space-y-4 min-w-0">
            {selectedQuestion && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${QT_COLOR[selectedQuestion.question_type ?? "development"] ?? "bg-gray-100 text-gray-600"}`}>{QT_LABEL[selectedQuestion.question_type ?? "development"]}</span>
                  {hasKey && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">Clave: {answerKey[selected.question_id]?.toUpperCase()}</span>}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{selectedQuestion.statement}</p>
                {selectedQuestion.alternatives && selectedQuestion.alternatives.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {selectedQuestion.alternatives.map(alt => (
                      <div key={alt.label} className={`flex gap-2 text-xs px-2 py-1 rounded ${answerKey[selected.question_id]===alt.label?"bg-green-50 text-green-800 font-medium":"text-gray-600"}`}>
                        <span className="font-medium">{alt.label.toUpperCase()})</span><span>{alt.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {imageUrl ? <img src={imageUrl} alt="Respuesta" className="w-full max-h-80 object-contain bg-gray-50" /> : <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>}
            </div>

            {!gr ? (
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <p className="text-sm text-gray-500 mb-4">Este ejercicio no ha sido corregido aún.</p>
                <button onClick={handleCorrect} disabled={correcting} className="bg-blue-600 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">{correcting?"Corrigiendo...":"Corregir con IA →"}</button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">Corrección IA</h3>
                  <div className="flex items-center gap-2">
                    {gr.ocr_confidence != null && <span className={`text-xs px-2 py-0.5 rounded font-medium ${gr.ocr_confidence>0.75?"bg-green-100 text-green-700":gr.ocr_confidence>0.45?"bg-amber-100 text-amber-700":"bg-red-100 text-red-700"}`}>{Math.round(gr.ocr_confidence*100)}% OCR</span>}
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${RS_COLOR[gr.review_status]??"bg-gray-100 text-gray-500"}`}>{RS_LABEL[gr.review_status]??gr.review_status}</span>
                    <button onClick={handleCorrect} disabled={correcting} className="text-xs border border-gray-200 px-2 py-1 rounded text-gray-500 hover:bg-gray-50 transition">{correcting?"...":"↻"}</button>
                  </div>
                </div>

                {gr.ocr_text && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-500 font-medium">Texto OCR</p>
                      <button onClick={() => setShowFeedback(!showFeedback)} className="text-xs text-blue-500 hover:underline">{showFeedback?"Cancelar":"Corregir OCR"}</button>
                    </div>
                    <pre className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono">{gr.ocr_text}</pre>
                  </div>
                )}

                {showFeedback && (
                  <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
                    <p className="text-xs text-blue-700 font-medium mb-2">Corrige el texto para entrenar el OCR (aprendizaje adaptativo)</p>
                    <textarea value={correctedOcr} onChange={e => setCorrectedOcr(e.target.value)} rows={3} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none bg-white" />
                    <button onClick={saveOcrFeedback} className="mt-2 bg-blue-600 text-white text-xs px-4 py-1.5 rounded-lg hover:bg-blue-700 transition">Guardar corrección OCR</button>
                  </div>
                )}

                <div className="flex items-center gap-6 py-3 border-y border-gray-100">
                  <div><p className="text-xs text-gray-500">Puntaje IA</p><p className="text-2xl font-bold text-gray-900">{gr.score??"-"}/{gr.max_score??"-"}</p></div>
                  {gr.teacher_override_score != null && <div><p className="text-xs text-gray-500">Ajustado</p><p className="text-2xl font-bold text-blue-600">{gr.teacher_override_score}/{gr.max_score}</p></div>}
                </div>

                {gr.student_feedback && <div><p className="text-xs text-gray-500 font-medium mb-1">Retroalimentación</p><p className="text-sm text-gray-700 leading-relaxed">{gr.student_feedback}</p></div>}
                {gr.errors_detected && gr.errors_detected.length > 0 && <ul className="space-y-1">{gr.errors_detected.map((e,i) => <li key={i} className="text-sm text-red-600 flex gap-2"><span>•</span>{e}</li>)}</ul>}

                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="w-32"><label className="text-xs text-gray-500 mb-1 block">Puntaje</label><input type="number" step="0.25" min="0" max={gr.max_score??10} value={overrideScore} onChange={e => setOverrideScore(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div className="flex-1"><label className="text-xs text-gray-500 mb-1 block">Nota docente</label><input type="text" value={overrideNote} onChange={e => setOverrideNote(e.target.value)} placeholder="Razón del ajuste..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  </div>
                  <button onClick={saveOverride} disabled={saving} className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-800 transition disabled:opacity-50">{saving?"Guardando...":"✓ Aprobar corrección"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
