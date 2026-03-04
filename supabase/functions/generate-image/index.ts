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

// System prompt is fixed and never contains user-controlled content.
// User content (WORLD.md) goes only in the user message.
const IMAGE_SYSTEM_PROMPT =
  "You are a fantasy RPG cover art generator. Generate a single dramatic, cinematic cover image faithfully depicting the world described by the user. Use rich atmospheric lighting, detailed environments, and an epic fantasy art style. Output only the image."

export function extractImageBytes(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data
  }

  throw new Error("No image data returned from Gemini")
}

export function getStoragePath(campaignId: string, type: string): string {
  return `${campaignId}/${type}.png`
}

async function createSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const { createClient } = await import("jsr:@supabase/supabase-js@2")

  return {
    supabaseUrl,
    serviceRoleKey,
    supabase: createClient(supabaseUrl, serviceRoleKey),
  }
}

async function broadcastImageReady(
  supabaseUrl: string,
  serviceRoleKey: string,
  campaignId: string,
  type: string,
  url: string,
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `campaign:${campaignId}`,
            event: "world:image_ready",
            payload: { type, url },
          },
        ],
      }),
    })

    if (!res.ok) {
      console.error(`[generate-image] broadcast failed HTTP ${res.status}`)
    }
  } catch (err) {
    console.error("[generate-image] broadcast threw", err)
  }
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get("GENERATE_IMAGE_WEBHOOK_SECRET")
  const authHeader = req.headers.get("authorization")
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  let body: { campaign_id?: string; type?: string }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  const { campaign_id, type = "cover" } = body
  if (!campaign_id) {
    return new Response("Missing campaign_id", { status: 400 })
  }

  try {
    const { supabaseUrl, serviceRoleKey, supabase } = await createSupabaseClient()

    const { data: fileRow, error: fileError } = await supabase
      .from("campaign_files")
      .select("content")
      .eq("campaign_id", campaign_id)
      .eq("filename", "WORLD.md")
      .single()

    if (fileError || !fileRow?.content) {
      throw new Error(`WORLD.md not found for campaign ${campaign_id}`)
    }

    const userPrompt = fileRow.content as string

    const { GoogleGenerativeAI } = await import("npm:@google/generative-ai")
    const genai = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!)
    const model = genai.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      systemInstruction: IMAGE_SYSTEM_PROMPT,
    })

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        // responseModalities currently missing from some TS type definitions
        // @ts-ignore
        responseModalities: ["IMAGE"],
      },
    })

    const base64Data = extractImageBytes(result.response as GeminiResponse)
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const storagePath = getStoragePath(campaign_id, type)

    const { error: uploadError } = await supabase.storage
      .from("campaign-images")
      .upload(storagePath, imageBytes, { contentType: "image/png", upsert: true })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from("campaign-images")
      .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl
    const column = type === "map" ? "map_image_url" : "cover_image_url"

    await supabase
      .from("campaigns")
      .update({ [column]: publicUrl })
      .eq("id", campaign_id)

    await broadcastImageReady(supabaseUrl, serviceRoleKey, campaign_id, type, publicUrl)

    return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[generate-image] failed", err)
    return new Response("Image generation failed", { status: 500 })
  }
})
