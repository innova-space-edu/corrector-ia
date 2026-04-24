"use client"

import { useState } from "react"
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
          // Crear registro en teachers
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / título */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Corrector IA</h1>
          <p className="text-sm text-gray-500 mt-1">Plataforma docente</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {/* Tabs */}
          <div className="flex border border-gray-200 rounded-lg p-0.5 mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 text-sm py-1.5 rounded-md font-medium transition ${
                mode === "login"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Ingresar
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 text-sm py-1.5 rounded-md font-medium transition ${
                mode === "register"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Registrarse
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="docente@colegio.cl"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || !email || !password}
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Cargando..."
                : mode === "login"
                ? "Ingresar"
                : "Crear cuenta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
