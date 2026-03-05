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
// User content (worlds.world_content) goes only in the user message.
const IMAGE_SYSTEM_PROMPT = `You are a tabletop RPG background art generator. Generate a single widescreen (16:9 landscape) cinematic scene that will be used as a full-bleed UI background for a web application.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich atmospheric scene content — no large empty or black areas
- The scene should extend edge-to-edge with interesting environmental details throughout
- The LEFT third should have the primary focal point or character
- The RIGHT third can be slightly less busy but must still contain atmospheric scene elements (background, environment, light, fog, etc.) — not darkness or emptiness
- Add only a very subtle dark vignette along the far right edge (last 10% of image width) to help UI text readability
- Add a subtle dark vignette along the bottom edge

VISUAL RULES:
- Do NOT include any text, titles, logos, labels, or typographic elements anywhere in the image
- Do NOT render book cover or movie poster layouts — this is environmental/atmospheric art
- Use deep, rich atmospheric lighting with dramatic shadows
- Genre must be faithfully rendered: crime gets gritty urban realism, sci-fi gets cold tech aesthetics, fantasy gets painterly drama, horror gets dark texture — never default to generic fantasy

Output only the image.`

// Prompt for cartographic/aerial map images. Fixed content — no user input.
const MAP_SYSTEM_PROMPT = `You are a cartographic illustrator for tabletop RPG worlds. Generate a single top-down aerial world map rendered in a painterly fantasy cartography style, suitable for use as a full-bleed UI background.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich map content — landmasses, oceans, forests, mountains, rivers, cities, roads
- Use warm parchment or aged vellum tones as the background, as though drawn on old paper
- Include subtle compass rose, coastline hatching, and illustrated terrain icons (mountain ridges, tree clusters, settlements)
- The map should feel hand-drawn with ink and watercolor washes, not photorealistic
- Do NOT leave large empty or uniform areas — every region should have detail

VISUAL RULES:
- Do NOT include any text labels, city names, region names, legends, or any typographic elements
- Match the genre: a sci-fi world gets star-chart / colony-map aesthetics; a horror world gets dark, decayed cartography; fantasy gets classic illustrated maps
- Use rich, saturated but antique-feeling colors

Output only the image.`

export function getSystemPrompt(type: string): string {
  return type === 'map' ? MAP_SYSTEM_PROMPT : IMAGE_SYSTEM_PROMPT
}

export function extractImageBytes(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data
  }

  throw new Error("No image data returned from Gemini")
}

export function getStoragePath(worldId: string, type: string): string {
  return `worlds/${worldId}/${type}.png`
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
  worldId: string,
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
            topic: `world:${worldId}`,
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

  let body: { world_id?: string; type?: string }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  const { world_id, type = "cover" } = body
  if (!world_id) {
    return new Response("Missing world_id", { status: 400 })
  }

  try {
    const { supabaseUrl, serviceRoleKey, supabase } = await createSupabaseClient()

    const { data: worldRow, error: worldError } = await supabase
      .from("worlds")
      .select("world_content")
      .eq("id", world_id)
      .single()

    if (worldError || !worldRow?.world_content) {
      throw new Error(`world_content not found for world ${world_id}`)
    }

    const userPrompt = worldRow.world_content as string

    const { GoogleGenerativeAI } = await import("npm:@google/generative-ai")
    const genai = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!)
    const model = genai.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      systemInstruction: getSystemPrompt(type),
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
    const storagePath = getStoragePath(world_id, type)

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
      .from("worlds")
      .update({ [column]: publicUrl })
      .eq("id", world_id)

    await broadcastImageReady(supabaseUrl, serviceRoleKey, world_id, type, publicUrl)

    return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[generate-image] failed", err)
    return new Response("Image generation failed", { status: 500 })
  }
})
