/**
 * lib/ai/ai-router.ts
 *
 * AI Router con cascada de fallback:
 *   1. Gemini 2.5 Flash  (Google AI Studio — 1,500 req/día gratis)
 *   2. Groq Llama 3.3    (Groq — 6,000 tokens/min gratis, muy rápido)
 *   3. OpenRouter :free  (DeepSeek R1 o Qwen3 — fallback final)
 *
 * Uso:
 *   const result = await callAI({ prompt: "...", task: "parse_pdf" })
 */

export type AITask =
  | "parse_assessment_pdf"   // analizar PDF oficial → JSON
  | "evaluate_exercise"      // corregir ejercicio con rúbrica
  | "generate_insights"      // analítica del curso
  | "generate_feedback"      // retroalimentación por estudiante

interface AICallOptions {
  prompt: string
  task: AITask
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean          // si true, fuerza salida JSON
}

interface AICallResult {
  content: string
  provider: string
  model: string
  tokensUsed?: number
}

// ─── CONFIGURACIÓN DE PROVEEDORES ─────────────────────────────────────────────

const PROVIDERS = [
  {
    name: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    apiKey: () => process.env.GOOGLE_AI_API_KEY ?? "",
    model: "gemini-2.5-flash-preview-05-20",
    available: () => !!process.env.GOOGLE_AI_API_KEY,
  },
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: () => process.env.GROQ_API_KEY ?? "",
    model: "llama-3.3-70b-versatile",
    available: () => !!process.env.GROQ_API_KEY,
  },
  {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: () => process.env.OPENROUTER_API_KEY ?? "",
    model: "deepseek/deepseek-r1:free",
    available: () => !!process.env.OPENROUTER_API_KEY,
  },
]

// Modelos alternativos en OpenRouter si el primero falla
const OPENROUTER_FALLBACK_MODELS = [
  "deepseek/deepseek-r1:free",
  "qwen/qwen3-32b:free",
  "google/gemma-3-27b-it:free",
]

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────

export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const {
    prompt,
    maxTokens = 1500,
    temperature = 0.1,
    jsonMode = false,
  } = options

  const errors: string[] = []

  for (const provider of PROVIDERS) {
    if (!provider.available()) {
      errors.push(`${provider.name}: no configurado (falta API key)`)
      continue
    }

    try {
      const result = await _callProvider(provider, prompt, maxTokens, temperature, jsonMode)
      console.log(`[AI Router] ✓ ${provider.name} (${provider.model})`)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[AI Router] ✗ ${provider.name} falló: ${msg}`)
      errors.push(`${provider.name}: ${msg}`)

      // Si es OpenRouter, probar modelos alternativos antes de descartar
      if (provider.name === "openrouter") {
        for (const altModel of OPENROUTER_FALLBACK_MODELS.slice(1)) {
          try {
            const result = await _callProvider(
              { ...provider, model: altModel },
              prompt,
              maxTokens,
              temperature,
              jsonMode
            )
            console.log(`[AI Router] ✓ openrouter fallback (${altModel})`)
            return result
          } catch {
            errors.push(`openrouter/${altModel}: falló`)
          }
        }
      }
    }
  }

  // Todos los proveedores fallaron
  throw new Error(
    `[AI Router] Todos los proveedores fallaron:\n${errors.join("\n")}`
  )
}

// ─── LLAMADA A UN PROVEEDOR ───────────────────────────────────────────────────

async function _callProvider(
  provider: typeof PROVIDERS[0],
  prompt: string,
  maxTokens: number,
  temperature: number,
  jsonMode: boolean
): Promise<AICallResult> {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature,
  }

  // Forzar salida JSON si el proveedor lo soporta
  if (jsonMode && provider.name !== "openrouter") {
    body.response_format = { type: "json_object" }
  }

  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey()}`,
      // OpenRouter requiere headers adicionales
      ...(provider.name === "openrouter" && {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://corrector-ia.vercel.app",
        "X-Title": "Corrector IA Docente",
      }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000), // 30 seg timeout
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`HTTP ${response.status}: ${errBody.slice(0, 200)}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ""

  if (!content) {
    throw new Error("Respuesta vacía del proveedor")
  }

  return {
    content,
    provider: provider.name,
    model: provider.model,
    tokensUsed: data.usage?.total_tokens,
  }
}

// ─── HELPER: PARSEAR JSON DE RESPUESTA IA ─────────────────────────────────────

export function parseAIJson<T>(content: string): T {
  // Limpiar bloques de código si el modelo los incluyó
  const clean = content
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim()

  // Extraer el JSON si viene con texto alrededor
  const match = clean.match(/\{[\s\S]+\}/)
  if (!match) {
    throw new Error(`No se encontró JSON válido en la respuesta: ${clean.slice(0, 200)}`)
  }

  return JSON.parse(match[0]) as T
}
