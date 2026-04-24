// app/api/assessments/upload-pdf/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const assessmentId = formData.get("assessmentId") as string | null

    if (!file || !assessmentId) {
      return NextResponse.json(
        { error: "Faltan file o assessmentId" },
        { status: 400 }
      )
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Solo se aceptan archivos PDF" },
        { status: 400 }
      )
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "El PDF no puede superar 50MB" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Path en el bucket: assessments/{assessmentId}/official.pdf
    const filePath = `assessments/${assessmentId}/official.pdf`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from("assessment-assets")
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: true, // reemplaza si ya existe
      })

    if (uploadError) {
      return NextResponse.json(
        { error: "Error al subir el PDF", detail: uploadError.message },
        { status: 500 }
      )
    }

    // Guardar path en la evaluación
    const { error: updateError } = await supabase
      .from("assessments")
      .update({ official_pdf_path: filePath })
      .eq("id", assessmentId)

    if (updateError) {
      return NextResponse.json(
        { error: "PDF subido pero no se pudo guardar el path", detail: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, filePath })
  } catch (error) {
    console.error("[upload-pdf]", error)
    const msg = error instanceof Error ? error.message : "Error desconocido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
