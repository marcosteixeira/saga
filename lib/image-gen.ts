import { genai } from '@/lib/gemini'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function generateAndStoreImage(options: {
  prompt: string
  bucket: string
  path: string
}): Promise<string> {
  const { prompt, bucket, path } = options

  const response = await genai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseModalities: ['IMAGE'] },
  })

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData?.data
  )

  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini returned no image data')
  }

  const buffer = Buffer.from(imagePart.inlineData.data, 'base64')
  const mimeType = imagePart.inlineData.mimeType ?? 'image/png'

  const supabase = createServerSupabaseClient()
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
