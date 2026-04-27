"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function ChangePasswordPage() {
  const supabase = createClient()

  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState("")

  async function handleChange() {
    setLoading(true)
    setMsg("")

    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      setMsg("❌ Error: " + error.message)
    } else {
      setMsg("✅ Contraseña actualizada correctamente")
      setPassword("")
    }

    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold">Cambiar contraseña</h2>

        <input
          type="password"
          placeholder="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border p-3"
        />

        <button
          onClick={handleChange}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-blue-600 p-3 text-white"
        >
          {loading ? "Actualizando..." : "Cambiar contraseña"}
        </button>

        {msg && <p className="mt-4 text-sm">{msg}</p>}
      </div>
    </div>
  )
}