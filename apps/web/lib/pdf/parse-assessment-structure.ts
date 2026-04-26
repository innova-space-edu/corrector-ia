// lib/pdf/parse-assessment-structure.ts

import { callAI, parseAIJson } from "@/lib/ai/ai-router"
import { buildAssessmentParserPrompt } from "@/lib/ai/parse-assessment-prompt"
import type { ParsedAssessmentStructure } from "@/types/assessment"

type ParsedQuestionExtended = {
  question_id: string
  statement: string
  max_points: number
  topic?: string
  options?: string[]
  correct_answer?: string | null
  answer_type?: "multiple_choice" | "true_false" | "development" | "unknown"
}

type ParsedItemExtended = {
  item_id: string
  label: string
  points_rule?: string
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

function detectAnswerType(itemLabel: string, questionText: string): ParsedQuestionExtended["answer_type"] {
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

  return "unknown"
}

function extractOptionsFromStatement(statement: string): {
  cleanStatement: string
  options: string[]
} {
  const text = statement.replace(/\r/g, "\n")

  const optionRegex = /(^|\n)\s*([a-eA-E])[\)\.]?\s+([\s\S]*?)(?=(\n\s*[a-eA-E][\)\.]?\s+)|$)/g

  const options: string[] = []
  let match: RegExpExecArray | null

  while ((match = optionRegex.exec(text)) !== null) {
    const letter = match[2].toLowerCase()
    const content = match[3].replace(/\n+/g, " ").trim()

    if (content.length > 0) {
      options.push(`${letter}) ${content}`)
    }
  }

  let cleanStatement = text
    .replace(optionRegex, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()

  if (options.length === 0) {
    cleanStatement = statement.trim()
  }

  return { cleanStatement, options }
}

function enrichParsedAssessment(
  parsed: ParsedAssessmentStructure,
  pdfText: string
): ParsedAssessmentExtended {
  const normalizedPdf = normalizeText(pdfText)

  const extended = parsed as ParsedAssessmentExtended

  extended.items = extended.items.map((item) => {
    const itemLabel = item.label ?? ""

    const questions = item.questions.map((q) => {
      const detected = extractOptionsFromStatement(q.statement)

      const answerType = detectAnswerType(itemLabel, q.statement)

      const updatedQuestion: ParsedQuestionExtended = {
        ...q,
        statement: detected.cleanStatement || q.statement,
        options: detected.options,
        answer_type: answerType,
        correct_answer: null,
      }

      // Refuerzo para V/F: si el parser no agregó tipo, se lo dejamos explícito.
      if (answerType === "true_false") {
        updatedQuestion.options = ["V", "F"]
      }

      return updatedQuestion
    })

    return {
      ...item,
      questions,
    }
  })

  // Segundo pase: si la IA perdió alternativas de selección múltiple,
  // intentamos recuperarlas desde el texto completo del PDF.
  extended.items = extended.items.map((item) => {
    if (!/selecci[oó]n m[uú]ltiple/i.test(item.label)) return item

    const rebuiltQuestions = item.questions.map((q, index) => {
      if (q.options && q.options.length >= 2) return q

      const currentNumber = index + 1
      const nextNumber = currentNumber + 1

      const questionBlockRegex = new RegExp(
        `${currentNumber}\\.?\\s*([\\s\\S]*?)(?=\\n\\s*${nextNumber}\\.|\\n\\s*Ítem|\\n\\s*Item|$)`,
        "i"
      )

      const found = normalizedPdf.match(questionBlockRegex)
      if (!found?.[1]) return q

      const detected = extractOptionsFromStatement(found[1])

      return {
        ...q,
        statement: detected.cleanStatement || q.statement,
        options: detected.options,
        answer_type: "multiple_choice" as const,
      }
    })

    return {
      ...item,
      questions: rebuiltQuestions,
    }
  })

  return extended
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
