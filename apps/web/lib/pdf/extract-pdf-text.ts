// lib/pdf/extract-pdf-text.ts
// Fixed: uses pdf-parse with better options to avoid text truncation

export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  const pdf = (await import("pdf-parse")).default

  const result = await pdf(buffer, {
    // Render all pages without limit
    max: 0,
    // Preserve layout for better alternative detection
    pagerender: async (pageData: any) => {
      const renderOptions = {
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      }
      const textContent = await pageData.getTextContent(renderOptions)
      let lastY: number | null = null
      let text = ""

      for (const item of textContent.items) {
        const i = item as any
        if (lastY !== null && Math.abs(i.transform[5] - lastY) > 5) {
          text += "\n"
        }
        text += i.str
        lastY = i.transform[5]
      }
      return text
    },
  })

  return result.text?.trim() ?? ""
}
