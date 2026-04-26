"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { LibraryExam } from "@/types/assessment"

const SUBJECTS = [
  { value: "", label: "Todas las asignaturas" },
  { value: "math", label: "Matemática" },
  { value: "language", label: "Lenguaje" },
  { value: "science", label: "Ciencias" },
  { value: "history", label: "Historia" },
  { value: "english", label: "Inglés" },
]

const SUBJECT_LABEL: Record<string, string> = {
  math: "Matemática", language: "Lenguaje", science: "Ciencias",
  history: "Historia", english: "Inglés",
}

const SUBJECT_COLOR: Record<string, string> = {
  math: "bg-blue-50 text-blue-700",
  language: "bg-purple-50 text-purple-700",
  science: "bg-green-50 text-green-700",
  history: "bg-amber-50 text-amber-700",
  english: "bg-pink-50 text-pink-700",
}

export default function LibraryPage() {
  const supabase = createClient()
  const [exams, setExams] = useState<LibraryExam[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [subject, setSubject] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: t } = await supabase.from("teachers").select("role").eq("user_id", user.id).single()
      setIsAdmin(["admin", "superadmin"].includes(t?.role ?? ""))
    }
    loadRole()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const params = new URLSearchParams()
      if (subject) params.set("subject", subject)
      if (search) params.set("search", search)
      const res = await fetch(`/api/library?${params}`)
      const json = await res.json()
      setExams(json.exams ?? [])
      setLoading(false)
    }
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [search, subject])

  async function handleDownload(exam: LibraryExam) {
    setDownloading(exam.id)
    const res = await fetch(`/api/library/${exam.id}/download`, { method: "POST" })
    const { url, title } = await res.json()
    if (url) {
      const a = document.createElement("a")
      a.href = url
      a.download = `${title}.pdf`
      a.click()
    }
    setDownloading(null)
  }

  async function handleDelete(examId: string) {
    if (!confirm("¿Eliminar este examen de la biblioteca? Esta acción no se puede deshacer.")) return
    await fetch("/api/admin/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "library_exam", id: examId }),
    })
    setExams((prev) => prev.filter((e) => e.id !== examId))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-gray-600 text-sm">←</a>
            <div>
              <h1 className="font-semibold text-gray-900">Biblioteca de exámenes</h1>
              <p className="text-xs text-gray-400">{exams.length} exámenes disponibles</p>
            </div>
          </div>
          <a
            href="/library/new"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
          >
            + Compartir examen
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Filtros */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título..."
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {SUBJECTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando...</div>
        ) : exams.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 mb-2">No hay exámenes aún.</p>
            <a href="/library/new" className="text-blue-600 hover:underline text-sm">
              Sé el primero en compartir uno →
            </a>
          </div>
        ) : (
          <div className="grid gap-4">
            {exams.map((exam) => (
              <div
                key={exam.id}
                className="bg-white rounded-xl border border-gray-200 p-5 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${SUBJECT_COLOR[exam.subject] ?? "bg-gray-100 text-gray-600"}`}>
                      {SUBJECT_LABEL[exam.subject] ?? exam.subject}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full">
                      {exam.grade_level}
                    </span>
                    {exam.total_points && (
                      <span className="text-xs text-gray-400">{exam.total_points} pts</span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 text-base mb-1">{exam.title}</h3>
                  {exam.description && (
                    <p className="text-sm text-gray-500 mb-2 line-clamp-2">{exam.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {exam.school_name && <span>{exam.school_name}</span>}
                    <span>{exam.download_count} descarga{exam.download_count !== 1 ? "s" : ""}</span>
                    <span>{new Date(exam.created_at).toLocaleDateString("es-CL")}</span>
                  </div>
                  {exam.tags && exam.tags.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {exam.tags.map((t) => (
                        <span key={t} className="text-xs bg-gray-50 border border-gray-200 text-gray-500 px-2 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(exam)}
                    disabled={downloading === exam.id}
                    className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
                  >
                    {downloading === exam.id ? "..." : "⬇ Descargar"}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(exam.id)}
                      className="text-red-500 text-xs border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
