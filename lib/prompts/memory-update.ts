export type MemoryUpdate = {
  npcs?: Array<{ name: string; status?: string; disposition?: string; note?: string }>
  locations?: Array<{ name: string; status?: string; note?: string }>
  character_updates?: Array<{ name: string; hp?: number; note?: string }>
  events?: string[]
  memory_md?: string
}

export type ExtractMemoryUpdateResult = {
  narration: string
  memoryUpdate: MemoryUpdate | null
  generateImage: string | null
}

export function extractMemoryUpdate(text: string): ExtractMemoryUpdateResult {
  let working = text
  let memoryUpdate: MemoryUpdate | null = null
  let generateImage: string | null = null

  // Extract MEMORY_UPDATE block (with optional ```json fences or raw JSON)
  const withFences = /MEMORY_UPDATE\s*\n```json\s*\n([\s\S]*?)\n```/
  const withoutFences = /MEMORY_UPDATE\s*\n(\{[\s\S]*?\})(?:\n|$)/

  const fenceMatch = working.match(withFences)
  if (fenceMatch) {
    try {
      memoryUpdate = JSON.parse(fenceMatch[1])
    } catch {
      memoryUpdate = null
    }
    working = working.replace(fenceMatch[0], '').trimEnd()
  } else {
    const rawMatch = working.match(withoutFences)
    if (rawMatch) {
      try {
        memoryUpdate = JSON.parse(rawMatch[1])
      } catch {
        memoryUpdate = null
      }
      working = working.replace(rawMatch[0], '').trimEnd()
    }
  }

  // Extract GENERATE_IMAGE directive
  const imageMatch = working.match(/GENERATE_IMAGE:\s*(.+)/)
  if (imageMatch) {
    generateImage = imageMatch[1].trim()
    working = working.replace(imageMatch[0], '').trimEnd()
  }

  return {
    narration: working,
    memoryUpdate,
    generateImage,
  }
}
