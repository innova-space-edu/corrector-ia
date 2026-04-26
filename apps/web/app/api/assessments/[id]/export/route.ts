// app/api/assessments/[id]/export/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: assessmentId } = await context.params
  const supabase = createAdminClient()

  // 1. Datos de la evaluación
  const { data: assessment } = await supabase
    .from("assessments")
    .select("title, subject, grade_level, total_points, passing_percentage")
    .eq("id", assessmentId)
    .single()

  if (!assessment) {
    return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 })
  }

  // 2. Todos los envíos con estudiante
  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, student_id, total_score, max_score, percentage, final_grade, grading_status, submitted_at, students(full_name, rut)")
    .eq("assessment_id", assessmentId)
    .order("students(full_name)")

  if (!submissions?.length) {
    return NextResponse.json({ error: "No hay envíos para exportar" }, { status: 404 })
  }

  // 3. Resultados por ejercicio de cada envío
  const { data: allResults } = await supabase
    .from("grading_results")
    .select("submission_id, question_id, score, max_score, review_status, teacher_override_score")
    .eq("assessment_id", assessmentId)

  const resultsBySubmission: Record<string, typeof allResults> = {}
  for (const r of allResults ?? []) {
    if (!resultsBySubmission[r.submission_id]) resultsBySubmission[r.submission_id] = []
    resultsBySubmission[r.submission_id]!.push(r)
  }

  // 4. Generar Excel con xlsx
  const XLSX = await import("xlsx")

  // ── Hoja 1: Resumen de notas ──────────────────────────────────────────────
  const summaryRows = submissions.map((s: any) => {
    const student = s.students
    const results = resultsBySubmission[s.id] ?? []
    const finalScore = results.reduce((sum: number, r: any) =>
      sum + (r.teacher_override_score ?? r.score ?? 0), 0)

    return {
      "Nombre": student?.full_name ?? "—",
      "RUT": student?.rut ?? "—",
      "Puntaje obtenido": s.total_score ?? finalScore ?? "—",
      "Puntaje máximo": s.max_score ?? assessment.total_points ?? "—",
      "Porcentaje (%)": s.percentage ?? "—",
      "Nota final": s.final_grade ?? "—",
      "Estado": {
        pending: "Pendiente",
        partial: "Parcial",
        completed: "Corregido",
        needs_review: "Revisar",
      }[s.grading_status as string] ?? s.grading_status,
      "Fecha envío": s.submitted_at
        ? new Date(s.submitted_at).toLocaleDateString("es-CL")
        : "—",
    }
  })

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows)

  // Anchos de columna
  summarySheet["!cols"] = [
    { wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 16 },
    { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
  ]

  // ── Hoja 2: Detalle por ejercicio ─────────────────────────────────────────
  const detailRows: Record<string, unknown>[] = []
  for (const s of submissions as any[]) {
    const student = s.students
    const results = resultsBySubmission[s.id] ?? []
    for (const r of results as any[]) {
      detailRows.push({
        "Nombre": student?.full_name ?? "—",
        "Ejercicio": r.question_id,
        "Puntaje IA": r.score ?? "—",
        "Puntaje docente": r.teacher_override_score ?? "—",
        "Puntaje máximo": r.max_score,
        "Estado revisión": {
          auto: "Auto", approved: "Aprobado",
          needs_review: "Revisar", manual_required: "Manual", pending: "Pendiente",
        }[r.review_status as string] ?? r.review_status,
      })
    }
  }

  const detailSheet = XLSX.utils.json_to_sheet(detailRows)
  detailSheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 15 }]

  // ── Hoja 3: Distribución de notas ─────────────────────────────────────────
  const grades: number[] = submissions
    .map((s: any) => s.final_grade)
    .filter((g: unknown): g is number => typeof g === "number")

  const distribution = [
    { "Rango": "7.0", "Cantidad": grades.filter((g) => g === 7.0).length },
    { "Rango": "6.0 – 6.9", "Cantidad": grades.filter((g) => g >= 6.0 && g < 7.0).length },
    { "Rango": "5.0 – 5.9", "Cantidad": grades.filter((g) => g >= 5.0 && g < 6.0).length },
    { "Rango": "4.0 – 4.9", "Cantidad": grades.filter((g) => g >= 4.0 && g < 5.0).length },
    { "Rango": "1.0 – 3.9 (Reprobado)", "Cantidad": grades.filter((g) => g < 4.0).length },
    { "Rango": "Sin nota", "Cantidad": submissions.length - grades.length },
    { "Rango": "── RESUMEN ──", "Cantidad": "" },
    { "Rango": "Promedio", "Cantidad": grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : "—" },
    { "Rango": "Aprobados", "Cantidad": grades.filter((g) => g >= 4.0).length },
    { "Rango": "Reprobados", "Cantidad": grades.filter((g) => g < 4.0).length },
    { "Rango": "% Aprobación", "Cantidad": grades.length ? `${Math.round((grades.filter((g) => g >= 4.0).length / grades.length) * 100)}%` : "—" },
  ]

  const distSheet = XLSX.utils.json_to_sheet(distribution)
  distSheet["!cols"] = [{ wch: 28 }, { wch: 12 }]

  // ── Crear libro ───────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, summarySheet, "Notas")
  XLSX.utils.book_append_sheet(wb, detailSheet, "Detalle ejercicios")
  XLSX.utils.book_append_sheet(wb, distSheet, "Distribución")

  // Metadata del libro
  wb.Props = {
    Title: `Notas — ${assessment.title}`,
    Author: "Corrector IA Docente",
    CreatedDate: new Date(),
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const filename = `notas_${assessment.title.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
    },
  })
}
