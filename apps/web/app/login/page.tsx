"use client"

import { useState } from "react"
import { RainbowProgress } from "@/components/RainbowProgress"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"login" | "register">("login")

  async function handleSubmit() {
    setError(null)
    setLoading(true)

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = "/"
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.user) {
          await supabase.from("teachers").insert({
            user_id: data.user.id,
            email,
            full_name: email.split("@")[0],
          })
          window.location.href = "/"
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al iniciar sesión"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#f8fbff_36%,#ffffff_74%)] p-5 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-40px)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:block">
          <div className="rainbow-border relative rounded-[2rem] bg-white p-8 shadow-2xl shadow-blue-100/70">
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              Corrector IA
            </span>
            <h1 className="mt-5 text-5xl font-black tracking-tight text-slate-950">
              Tu copiloto para corregir, retroalimentar y decidir mejor.
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Una plataforma blanca y azul, diseñada para docentes: clara, rápida, amigable y preparada para corrección automática con OCR e inteligencia artificial.
            </p>
            <div className="mt-8 grid gap-3">
              {["Corrección con IA", "Reportes por estudiante", "Insights pedagógicos", "Revisión manual del docente"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-blue-50 bg-blue-50/60 p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-blue-600">✓</span>
                  <span className="text-sm font-bold text-slate-700">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <RainbowProgress label="Preparando ambiente docente" />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-600 via-cyan-400 to-violet-500 text-lg font-black text-white shadow-xl shadow-blue-200 lg:mx-0">
              IA
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950">Bienvenido docente</h2>
            <p className="mt-2 text-sm text-slate-500">Ingresa para continuar con tu panel de corrección inteligente.</p>
          </div>

          <div className="rounded-[2rem] border border-blue-100 bg-white/90 p-6 shadow-xl shadow-blue-100/60 backdrop-blur">
            <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <button
                onClick={() => setMode("login")}
                className={`rounded-xl py-2 text-sm font-black transition ${mode === "login" ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "text-slate-500 hover:text-slate-800"}`}
              >
                Ingresar
              </button>
              <button
                onClick={() => setMode("register")}
                className={`rounded-xl py-2 text-sm font-black transition ${mode === "register" ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "text-slate-500 hover:text-slate-800"}`}
              >
                Registrarse
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">Correo electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="docente@colegio.cl"
                  className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              {loading && <RainbowProgress label="Validando acceso seguro" />}

              <button
                onClick={handleSubmit}
                disabled={loading || !email || !password}
                className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Cargando..." : mode === "login" ? "Ingresar al panel" : "Crear cuenta docente"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
