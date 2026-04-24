// lib/pdf/extract-pdf-text.ts

export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  // pdf-parse debe correr solo en Node runtime (no Edge)
  const pdf = (await import("pdf-parse")).default

  const result = await pdf(buffer)
  return result.text?.trim() ?? ""
}
