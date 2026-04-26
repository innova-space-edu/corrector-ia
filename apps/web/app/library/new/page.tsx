"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

const SUBJECTS = [
  { value: "math", label: "Matemática" },
  { value: "language", label: "Lenguaje" },
  { value: "science", label: "Ciencias" },
  { value: "history", label: "Historia" },
  { value: "english", label: "Inglés" },
]

export default function LibraryNewPage() {
  const supabase = createClient()
  const [title, setTitle] = useState("")
  const [subject, setSubject] = useState("math")
  const [gradeLevel, setGradeLevel] = useState("")
  const [description, setDescription] = useState("")
  const [schoolName, setSchoolName] = useState("")
  const [tags, setTags] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<"form" | "uploading" | "done">("form")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!title.trim() || !gradeLevel.trim() || !file) {
      setError("Título, nivel y PDF son obligatorios")
      return
    }
    setStep("uploading")

    try {
      // 1. Subir PDF
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No autenticado")

      const path = `shared/${user.id}/${Date.now()}_${file.name.replace(/\s/g, "_")}`
      const { error: uploadErr } = await supabase.storage
        .from("library-pdfs")
        .upload(path, file, { contentType: "application/pdf", upsert: false })
      if (uploadErr) throw uploadErr

      // 2. Crear registro
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subject,
          grade_level: gradeLevel.trim(),
          description: description.trim() || null,
          school_name: schoolName.trim() || null,
          pdf_path: path,
          tags: tags.trim() ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setStep("done")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir")
      setStep("form")
    }
  }

  if (step === "done") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-sm w-full">
          <div className="text-4xl mb-4">✓</div>
          <h2 className="font-semibold text-gray-900 text-lg mb-2">¡Examen compartido!</h2>
          <p className="text-sm text-gray-500 mb-6">Ahora está disponible para toda la comunidad docente.</p>
          <div className="flex gap-3">
            <a href="/library" className="flex-1 text-center bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
              Ver biblioteca
            </a>
            <button onClick={() => { setStep("form"); setTitle(""); setFile(null) }}
              className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
              Compartir otro
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <a href="/library" className="text-gray-400 hover:text-gray-600 text-sm">←</a>
          <h1 className="font-semibold text-gray-900">Compartir examen en la biblioteca</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Título del examen</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Prueba Unidad 1 — Interés Simple y Compuesto"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Asignatura</label>
              <select value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SUBJECTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nivel / Curso</label>
              <input type="text" value={gradeLevel} onChange={e => setGradeLevel(e.target.value)}
                placeholder="4° medio"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción (opcional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Prueba sumativa sobre porcentajes, interés simple y compuesto..."
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Colegio (opcional)</label>
              <input type="text" value={schoolName} onChange={e => setSchoolName(e.target.value)}
                placeholder="Colegio Providencia"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Etiquetas (separadas por coma)</label>
              <input type="text" value={tags} onChange={e => setTags(e.target.value)}
                placeholder="porcentajes, IVA, interés"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Archivo PDF</label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-400 transition">
              <input type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="hidden" id="lib-pdf" />
              <label htmlFor="lib-pdf" className="cursor-pointer">
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-blue-600">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
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

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
            Al compartir, este examen quedará disponible para que cualquier docente de la plataforma lo pueda ver y descargar. Solo los administradores pueden eliminar exámenes de la biblioteca.
          </div>

          <button onClick={handleSubmit} disabled={step === "uploading"}
            className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60">
            {step === "uploading" ? "Subiendo..." : "Compartir en la biblioteca →"}
          </button>
        </div>
      </main>
    </div>
  )
}
