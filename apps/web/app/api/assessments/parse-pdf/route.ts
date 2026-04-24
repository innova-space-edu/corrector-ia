// app/api/assessments/parse-pdf/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { extractPdfTextFromBuffer } from "@/lib/pdf/extract-pdf-text"
import { parseAssessmentStructureWithAI } from "@/lib/pdf/parse-assessment-structure"

export const runtime = "nodejs" // pdf-parse requiere Node, no Edge

export async function POST(req: NextRequest) {
  try {
    const { assessmentId, filePath } = await req.json()

    if (!assessmentId || !filePath) {
      return NextResponse.json(
        { error: "Faltan assessmentId o filePath" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // 1. Descargar PDF desde Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("assessment-assets")
      .download(filePath)

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: "No se pudo descargar el PDF", detail: downloadError?.message },
        { status: 500 }
      )
    }

    // 2. Extraer texto del PDF
    const arrayBuffer = await fileData.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const extractedText = await extractPdfTextFromBuffer(buffer)

    if (!extractedText || extractedText.length < 30) {
      return NextResponse.json(
        { error: "No se pudo extraer texto del PDF. ¿Es un PDF escaneado sin OCR?" },
        { status: 422 }
      )
    }

    // 3. Parsear estructura con IA
    const parsedStructure = await parseAssessmentStructureWithAI(extractedText)

    // 4. Guardar en assessments
    const { error: updateError } = await supabase
      .from("assessments")
      .update({
        official_test_text: extractedText,
        official_test_json: parsedStructure,
        assessment_structure_json: parsedStructure,
        total_points: parsedStructure.total_points ?? null,
      })
      .eq("id", assessmentId)

    if (updateError) {
      return NextResponse.json(
        { error: "No se pudo guardar la estructura", detail: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      assessmentId,
      extractedTextLength: extractedText.length,
      parsedStructure,
    })
  } catch (error) {
    console.error("[parse-pdf]", error)
    const msg = error instanceof Error ? error.message : "Error desconocido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
