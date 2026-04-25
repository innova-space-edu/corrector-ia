import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Corrector IA Docente",
  description: "Plataforma docente para corrección automática, retroalimentación e insights pedagógicos con IA.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
