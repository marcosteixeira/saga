type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data: string; mimeType: string }
        text?: string
      }>
    }
  }>
}

const IMAGE_SYSTEM_PROMPT = `You are a tabletop RPG scene artist. Generate a single widescreen (16:9 landscape) cinematic scene showing a group of adventurers in the described setting.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich atmospheric scene content — no large empty or black areas
- The scene should extend edge-to-edge with interesting environmental details
- Show the party of adventurers as silhouettes or mid-ground figures
- Add a subtle dark vignette along the bottom edge for UI text readability

VISUAL RULES:
- Do NOT include any text, titles, logos, or labels anywhere in the image
- Use deep, rich atmospheric lighting with dramatic shadows
- Genre must be faithfully rendered from the world description

Output only the image.`

export function extractImageBytes(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data
  }
  throw new Error('No image data returned from Gemini')
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get('GENERATE_SCENE_IMAGE_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { session_id?: string; campaign_id?: string; world_name?: string; world_content?: string; player_list?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { session_id, campaign_id, world_name, world_content, player_list } = body
  if (!session_id || !campaign_id || !world_content) {
    return new Response('Missing required fields', { status: 400 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('jsr:@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const userPrompt = `World: ${world_name ?? 'Unknown'}

${world_content}

Party:
${player_list ?? 'A group of adventurers'}`

    const { GoogleGenerativeAI } = await import('npm:@google/generative-ai')
    const genai = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!)
    const model = genai.getGenerativeModel({
      model: 'gemini-3-pro-image-preview',
      systemInstruction: IMAGE_SYSTEM_PROMPT,
    })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        // @ts-ignore
        responseModalities: ['IMAGE'],
      },
    })

    const base64Data = extractImageBytes(result.response as GeminiResponse)
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const storagePath = `sessions/${session_id}/scene.png`

    const { error: uploadError } = await supabase.storage
      .from('campaign-images')
      .upload(storagePath, imageBytes, { contentType: 'image/png', upsert: true })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from('campaign-images')
      .getPublicUrl(storagePath)

    await supabase
      .from('sessions')
      .update({ scene_image_url: urlData.publicUrl })
      .eq('id', session_id)

    return new Response(JSON.stringify({ ok: true, url: urlData.publicUrl }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generate-scene-image] failed', err)
    return new Response('Image generation failed', { status: 500 })
  }
})
