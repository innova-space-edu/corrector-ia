// lib/pdf/parse-assessment-structure.ts

import { callAI, parseAIJson } from "@/lib/ai/ai-router"
import { buildAssessmentParserPrompt } from "@/lib/ai/parse-assessment-prompt"
import type { ParsedAssessmentStructure } from "@/types/assessment"

export async function parseAssessmentStructureWithAI(
  pdfText: string
): Promise<ParsedAssessmentStructure> {
  if (!pdfText || pdfText.trim().length < 50) {
    throw new Error("El texto del PDF es demasiado corto para analizarlo")
  }

  const prompt = buildAssessmentParserPrompt(pdfText)

  const result = await callAI({
    prompt,
    task: "parse_assessment_pdf",
    maxTokens: 2000,
    temperature: 0.1,
    jsonMode: true,
  })

  const parsed = parseAIJson<ParsedAssessmentStructure>(result.content)

  // Validación mínima
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error("El parser no detectó ítems en la prueba")
  }

  return parsed
}
