import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gemini', () => ({
  genai: {
    models: {
      generateContent: vi.fn()
    }
  }
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://storage.example.com/image.png' }
        })
      }))
    }
  }))
}))

describe('generateAndStoreImage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls Gemini with the prompt and returns storage URL', async () => {
    const { genai } = await import('@/lib/gemini')
    vi.mocked(genai.models.generateContent).mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: 'base64imagedata', mimeType: 'image/png' } }]
        }
      }]
    } as any)

    const { generateAndStoreImage } = await import('../image-gen')
    const url = await generateAndStoreImage({
      prompt: 'A dark castle',
      bucket: 'campaign-images',
      path: 'test/cover.png'
    })
    expect(url).toBe('https://storage.example.com/image.png')
  })

  it('throws when Gemini returns no image data', async () => {
    const { genai } = await import('@/lib/gemini')
    vi.mocked(genai.models.generateContent).mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'No image generated' }] } }]
    } as any)

    const { generateAndStoreImage } = await import('../image-gen')
    await expect(
      generateAndStoreImage({ prompt: 'test', bucket: 'b', path: 'p' })
    ).rejects.toThrow()
  })
})
