"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

const navItems = [
  { href: "/", icon: "🏠", label: "Inicio" },
  { href: "/assessments/new", icon: "✨", label: "Nueva evaluación" },
  { href: "/#evaluaciones", icon: "📚", label: "Evaluaciones" },
  { href: "/#analitica", icon: "📊", label: "Analítica" },
]

type AppShellProps = {
  children: React.ReactNode
  title?: string
  subtitle?: string
  action?: React.ReactNode
}

export function AppShell({
  children,
  title = "Panel docente",
  subtitle,
  action,
}: AppShellProps) {
  const router = useRouter()
  const supabase = createClient()

  function goToChangePassword() {
    router.push("/change-password")
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut()
      router.replace("/login")
      router.refresh()
    } catch (error) {
      console.error("Error al cerrar sesión:", error)
      window.location.href = "/login"
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#f8fbff_34%,#ffffff_70%)] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-blue-100 bg-white/90 p-5 shadow-xl shadow-blue-100/40 backdrop-blur lg:block">
        <Link href="/" className="flex items-center gap-3 rounded-3xl bg-blue-50 p-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-400 to-violet-500 text-xl text-white shadow-lg shadow-blue-200">
            IA
          </div>
          <div>
            <p className="text-sm font-black tracking-tight text-slate-950">Corrector IA</p>
            <p className="text-xs text-slate-500">Asistente docente</p>
          </div>
        </Link>

        <nav className="mt-8 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 transition group-hover:bg-white">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}

          <button
            type="button"
            onClick={goToChangePassword}
            className="group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 transition group-hover:bg-white">
              🔐
            </span>
            Cambiar contraseña
          </button>
        </nav>

        <div className="absolute bottom-5 left-5 right-5 space-y-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-black text-red-600 shadow-sm transition hover:bg-red-100"
          >
            <span>🚪</span>
            Cerrar sesión
          </button>

          <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-600 to-cyan-500 p-4 text-white shadow-lg shadow-blue-200">
            <p className="text-sm font-bold">Corrección inteligente</p>
            <p className="mt-1 text-xs text-blue-50">
              OCR + IA + retroalimentación para ahorrar tiempo docente.
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/80 px-5 py-4 backdrop-blur-xl lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-500">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Plataforma activa
              </div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 md:text-2xl">
                {title}
              </h1>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>

            <div className="flex items-center gap-2">
              {action}

              <button
                type="button"
                onClick={goToChangePassword}
                className="hidden rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 md:inline-flex"
              >
                Cambiar contraseña
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-100"
              >
                Salir
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-5 py-7 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
