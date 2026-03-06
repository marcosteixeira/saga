import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { broadcastToChannel } from "../generate-world/broadcast.ts"
import { WORLD_MAP_IMAGE_SYSTEM_PROMPT, WORLD_IMAGE_SYSTEM_PROMPT, SCENE_IMAGE_SYSTEM_PROMPT, buildPromptForCampaign } from "./prompt.ts"

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

export function extractImageBytes(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data
  }
  throw new Error("No image data returned from Gemini")
}

export function getStoragePath(entityType: string, entityId: string, imageType: string): string {
  if (entityType === "world") return `worlds/${entityId}/${imageType}.png`
  if (entityType === "campaign") return `campaigns/${entityId}/${imageType}.png`
  if (entityType === "player") return `players/${entityId}/${imageType}.png`
  return `${entityType}s/${entityId}/${imageType}.png`
}


async function buildPrompt(
  supabase: ReturnType<typeof createClient>,
  entityType: string,
  entityId: string,
  imageType: string,
): Promise<{ systemPrompt: string; userPrompt: string; worldId: string }> {
  if (entityType === "world") {
    const { data: world, error } = await supabase
      .from("worlds")
      .select("world_content")
      .eq("id", entityId)
      .single()
    if (error || !world?.world_content) throw new Error(`world_content not found for world ${entityId}`)
    const systemPrompt = imageType === "map" ? WORLD_MAP_IMAGE_SYSTEM_PROMPT : WORLD_IMAGE_SYSTEM_PROMPT
    // Prefix instructs Gemini to depict atmosphere/aesthetic only — avoids copyright blocks
    // when world content references real IP (Star Wars, LotR, etc.)
    const userPrompt = `Depict the atmosphere, aesthetic, and visual feel of this setting. Do NOT depict any specific named characters, logos, or trademarked designs. Focus on environment, lighting, mood, and genre:\n\n${world.world_content as string}`
    return {
      systemPrompt,
      userPrompt,
      worldId: entityId,
    }
  }

  if (entityType === "campaign") {
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("world_id")
      .eq("id", entityId)
      .single()
    if (campaignError || !campaign) throw new Error(`campaign not found: ${entityId}`)

    const { data: world, error: worldError } = await supabase
      .from("worlds")
      .select("name, world_content")
      .eq("id", campaign.world_id)
      .single()
    if (worldError || !world?.world_content) throw new Error(`world not found for campaign ${entityId}`)

    const { data: players } = await supabase
      .from("players")
      .select("character_name, character_class, character_backstory, username")
      .eq("campaign_id", entityId)

    return {
      systemPrompt: SCENE_IMAGE_SYSTEM_PROMPT,
      userPrompt: buildPromptForCampaign(world.name, world.world_content as string, players ?? []),
      worldId: campaign.world_id,
    }
  }

  throw new Error(`Unsupported entity_type: ${entityType}`)
}

export async function broadcastImageReady(
  supabaseUrl: string,
  serviceRoleKey: string,
  worldId: string,
  entityType: string,
  entityId: string,
  imageType: string,
  publicUrl: string,
  imageId: string,
): Promise<void> {
  await broadcastToChannel(supabaseUrl, serviceRoleKey, `world:${worldId}`, "image:ready", {
    entity_type: entityType,
    entity_id: entityId,
    image_type: imageType,
    url: publicUrl,
    image_id: imageId,
  })
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get("GENERATE_IMAGE_WEBHOOK_SECRET")
  const authHeader = req.headers.get("authorization")
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  let body: { entity_type?: string; entity_id?: string; image_type?: string }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  const { entity_type, entity_id, image_type } = body
  if (!entity_type || !entity_id || !image_type) {
    return new Response("Missing required fields: entity_type, entity_id, image_type", { status: 400 })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const { createClient } = await import("jsr:@supabase/supabase-js@2")
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Singleton image types have one canonical row per entity — find-or-create then reset to generating.
  // Multi image types (e.g. portraits) accumulate rows over time — always insert.
  const SINGLETON_IMAGE_TYPES = new Set(["cover", "map"])
  const isSingleton = SINGLETON_IMAGE_TYPES.has(image_type)

  // 1. Create or update images row
  let imageId: string

  if (isSingleton) {
    // Can't use upsert with onConflict here because the unique index is partial (per image_type).
    // Instead: find existing row and reset it, or insert a fresh one.
    const { data: existing } = await supabase
      .from("images")
      .select("id")
      .eq("entity_type", entity_type)
      .eq("entity_id", entity_id)
      .eq("image_type", image_type)
      .maybeSingle()

    if (existing) {
      const { error: updateError } = await supabase
        .from("images")
        .update({ status: "generating", storage_path: null, public_url: null, error: null })
        .eq("id", existing.id)
      if (updateError) {
        console.error("[generate-image] failed to reset images row", updateError)
        return new Response("Failed to create image record", { status: 500 })
      }
      imageId = existing.id
    } else {
      const { data: imageRow, error: insertError } = await supabase
        .from("images")
        .insert({ entity_type, entity_id, image_type, status: "generating" })
        .select("id")
        .single()
      if (insertError || !imageRow) {
        console.error("[generate-image] failed to insert images row", insertError)
        return new Response("Failed to create image record", { status: 500 })
      }
      imageId = imageRow.id
    }
  } else {
    const { data: imageRow, error: insertError } = await supabase
      .from("images")
      .insert({ entity_type, entity_id, image_type, status: "generating" })
      .select("id")
      .single()

    if (insertError || !imageRow) {
      console.error("[generate-image] failed to insert images row", insertError)
      return new Response("Failed to create image record", { status: 500 })
    }
    imageId = imageRow.id
  }

  try {
    // 2. Build prompt
    const { systemPrompt, userPrompt, worldId } = await buildPrompt(supabase, entity_type, entity_id, image_type)

    // 3. Call Gemini
    const { GoogleGenerativeAI } = await import("npm:@google/generative-ai")
    const genai = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!)
    const model = genai.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      systemInstruction: systemPrompt,
    })

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        // @ts-ignore
        responseModalities: ["IMAGE"],
      },
    })

    const base64Data = extractImageBytes(result.response as GeminiResponse)
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const storagePath = getStoragePath(entity_type, entity_id, image_type)

    // 4. Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("campaign-images")
      .upload(storagePath, imageBytes, { contentType: "image/png", upsert: true })
    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage.from("campaign-images").getPublicUrl(storagePath)
    const publicUrl = urlData.publicUrl

    // 5. Update images row
    await supabase
      .from("images")
      .update({ status: "ready", storage_path: storagePath, public_url: publicUrl })
      .eq("id", imageId)

    // 6. Broadcast
    await broadcastImageReady(supabaseUrl, serviceRoleKey, worldId, entity_type, entity_id, image_type, publicUrl, imageId)

    return new Response(JSON.stringify({ ok: true, url: publicUrl, image_id: imageId }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[generate-image] failed", err)
    await supabase
      .from("images")
      .update({ status: "failed", error: String(err) })
      .eq("id", imageId)
    return new Response("Image generation failed", { status: 500 })
  }
})
