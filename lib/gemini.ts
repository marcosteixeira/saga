import { GoogleGenAI } from '@google/genai'

let _genai: GoogleGenAI | null = null

export function getGenai(): GoogleGenAI {
  if (!_genai) {
    _genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! })
  }
  return _genai
}

// Keep named export for backwards compatibility with existing code
export const genai = {
  get models() { return getGenai().models }
}
