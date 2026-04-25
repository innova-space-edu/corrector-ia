export function RainbowProgress({ label = "Procesando con IA..." }: { label?: string }) {
  return (
    <div className="w-full rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-xs font-semibold text-blue-600">En progreso</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="rainbow-loader h-full w-2/3 rounded-full" />
      </div>
    </div>
  )
}
