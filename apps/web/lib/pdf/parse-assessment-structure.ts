// lib/pdf/parse-assessment-structure.ts

import { callAI, parseAIJson } from "@/lib/ai/ai-router"
import { buildAssessmentParserPrompt } from "@/lib/ai/parse-assessment-prompt"
import type { ParsedAssessmentStructure, ParsedAssessmentQuestion } from "@/types/assessment"

type ParsedQuestionExtended = ParsedAssessmentQuestion & {
  options?: string[]
  answer_type?: "multiple_choice" | "true_false" | "development" | "unknown"
}

type ParsedItemExtended = {
  item_id: string
  label: string
  item_type?: string
  points_rule?: string
  instructions?: string
  questions: ParsedQuestionExtended[]
}

type ParsedAssessmentExtended = Omit<ParsedAssessmentStructure, "items"> & {
  items: ParsedItemExtended[]
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function detectQuestionType(
  itemLabel: string,
  questionText: string
): ParsedAssessmentQuestion["question_type"] {
  const text = `${itemLabel} ${questionText}`.toLowerCase()

  if (
    text.includes("selección múltiple") ||
    text.includes("seleccion multiple") ||
    /^[a-e]\)/im.test(questionText) ||
    /^[a-e]\./im.test(questionText)
  ) {
    return "multiple_choice"
  }

  if (
    text.includes("verdadero") ||
    text.includes("falso") ||
    text.includes("v/f") ||
    text.includes("verdadero y falso")
  ) {
    return "true_false"
  }

  if (
    text.includes("desarrollo") ||
    text.includes("aplicación") ||
    text.includes("aplicacion") ||
    text.includes("calcula")
  ) {
    return "development"
  }

  return "development"
}

function extractOptionsFromStatement(statement: string): {
  cleanStatement: string
  options: string[]
  alternatives: { label: string; text: string }[]
} {
  const text = statement.replace(/\r/g, "\n")
  const optionRegex = /(^|\n)\s*([a-eA-E])[\)\.]\s+([\s\S]*?)(?=(\n\s*[a-eA-E][\)\.]\s+)|$)/g

  const options: string[] = []
  const alternatives: { label: string; text: string }[] = []
  let match: RegExpExecArray | null

  while ((match = optionRegex.exec(text)) !== null) {
    const letter = match[2].toLowerCase()
    const content = match[3].replace(/\n+/g, " ").trim()
    if (content.length > 0) {
      options.push(`${letter}) ${content}`)
      alternatives.push({ label: letter, text: content })
    }
  }

  let cleanStatement = text
    .replace(optionRegex, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()

  if (options.length === 0) cleanStatement = statement.trim()

  return { cleanStatement, options, alternatives }
}

function enrichParsedAssessment(
  parsed: ParsedAssessmentStructure,
  pdfText: string
): ParsedAssessmentStructure {
  const normalizedPdf = normalizeText(pdfText)

  const enrichedItems = parsed.items.map((item) => {
    const itemLabel = item.label ?? ""
    const rawItemType = detectQuestionType(itemLabel, "")
    const detectedItemType: "multiple_choice" | "true_false" | "development" | "mixed" | undefined =
      (rawItemType === "fill_blank" || rawItemType === "matching") ? "mixed" : rawItemType

    const questions: ParsedAssessmentQuestion[] = item.questions.map((q) => {
      const detected = extractOptionsFromStatement(q.statement)

      // Use question_type from AI if present, otherwise detect from context
      const questionType: ParsedAssessmentQuestion["question_type"] =
        q.question_type && q.question_type !== "development"
          ? q.question_type
          : detectQuestionType(itemLabel, q.statement)

      // Merge alternatives from AI with extracted ones
      const mergedAlternatives =
        (q.alternatives && q.alternatives.length > 0)
          ? q.alternatives
          : detected.alternatives

      const enriched: ParsedAssessmentQuestion = {
        ...q,
        question_type: questionType,
        statement: detected.cleanStatement || q.statement,
        alternatives: questionType === "true_false"
          ? [{ label: "V", text: "Verdadero" }, { label: "F", text: "Falso" }]
          : mergedAlternatives,
        sub_parts: q.sub_parts ?? [],
      }

      return enriched
    })

    return {
      ...item,
      item_type: detectedItemType,
      questions,
    }
  })

  // Second pass: recover missing MC alternatives from raw PDF text
  const finalItems = enrichedItems.map((item) => {
    if (!/selecci[oó]n m[uú]ltiple/i.test(item.label)) return item

    const rebuiltQuestions = item.questions.map((q, index) => {
      if (q.alternatives && q.alternatives.length >= 2) return q

      const currentNumber = index + 1
      const nextNumber = currentNumber + 1

      const questionBlockRegex = new RegExp(
        `${currentNumber}\\.?\\s*([\\s\\S]*?)(?=\\n\\s*${nextNumber}\\.|\\n\\s*Ítem|\\n\\s*Item|$)`,
        "i"
      )

      const found = normalizedPdf.match(questionBlockRegex)
      if (!found?.[1]) return q

      const detected = extractOptionsFromStatement(found[1])
      if (detected.alternatives.length < 2) return q

      return {
        ...q,
        statement: detected.cleanStatement || q.statement,
        alternatives: detected.alternatives,
        question_type: "multiple_choice" as const,
      }
    })

    return { ...item, questions: rebuiltQuestions }
  })

  return { ...parsed, items: finalItems }
}

export async function parseAssessmentStructureWithAI(
  pdfText: string
): Promise<ParsedAssessmentStructure> {
  if (!pdfText || pdfText.trim().length < 50) {
    throw new Error("El texto del PDF es demasiado corto para analizarlo")
  }

  const normalizedPdf = normalizeText(pdfText)
  const prompt = buildAssessmentParserPrompt(normalizedPdf)

  const result = await callAI({
    prompt,
    task: "parse_assessment_pdf",
    maxTokens: 4000,
    temperature: 0.1,
    jsonMode: true,
  })

  const parsed = parseAIJson<ParsedAssessmentStructure>(result.content)

  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error("El parser no detectó ítems en la prueba")
  }

  return enrichParsedAssessment(parsed, normalizedPdf)
}
