import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { getMissingRequiredSections, parseClassesFromContent, stripClassesFromContent, validateClasses, WorldClass } from "./world-content.ts"
import { logError, logInfo } from "./logging.ts"
import { broadcastToChannel } from "./broadcast.ts"
import { GENERATE_WORLD_SYSTEM_PROMPT } from "./prompt.ts"

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
})

const WORLD_GEN_MAX_TOKENS = 2048
const WORLD_GEN_MAX_ATTEMPTS = 3

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabase = createClient(supabaseUrl, serviceRoleKey)

Deno.serve(async (req: Request) => {
  const requestStartedAt = Date.now()
  const requestId = crypto.randomUUID()

  logInfo("generate_world.request_received", {
    requestId,
    method: req.method,
    path: new URL(req.url).pathname,
  })

  const webhookSecret = Deno.env.get("GENERATE_WORLD_WEBHOOK_SECRET")
  const authHeader = req.headers.get("authorization")
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    logInfo("generate_world.auth_failed", { requestId })
    return new Response("Unauthorized", { status: 401 })
  }
  logInfo("generate_world.auth_validated", { requestId })

  const payload = await req.json()
  const world = payload.record

  if (!world?.id || !world?.description) {
    logInfo("generate_world.payload_invalid", {
      requestId,
      hasWorldId: Boolean(world?.id),
      hasDescription: Boolean(world?.description),
    })
    return new Response("Invalid payload", { status: 400 })
  }
  logInfo("generate_world.payload_validated", {
    requestId,
    worldId: world.id,
    descriptionLength: world.description.length,
  })

  const worldChannel = `world:${world.id}`

  try {
    await broadcastToChannel(supabaseUrl, serviceRoleKey, worldChannel, "world:started", {
      status: "generating",
    })

    const systemPrompt = GENERATE_WORLD_SYSTEM_PROMPT

    let worldContent = ""
    let missingSections: string[] = []
    let parsedClasses: WorldClass[] = []

    for (let attempt = 1; attempt <= WORLD_GEN_MAX_ATTEMPTS; attempt++) {
      const attemptStartedAt = Date.now()
      const retryInstruction =
        attempt === 1
          ? ""
          : `\n\nYour previous response was incomplete. Regenerate WORLD.md and include all required sections exactly as written. Keep each section concise (2-4 paragraphs or 3-6 bullet points).\nMissing sections: ${missingSections.join(", ")}`

      logInfo("generate_world.ai_attempt_started", {
        requestId,
        worldId: world.id,
        attempt,
        maxAttempts: WORLD_GEN_MAX_ATTEMPTS,
        retryMissingSections: missingSections,
      })

      const aiResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: WORLD_GEN_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: `${world.description}${retryInstruction}` }],
      })

      worldContent = aiResponse.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("")

      missingSections = getMissingRequiredSections(worldContent)
      parsedClasses = parseClassesFromContent(worldContent)
      const classesValid = validateClasses(parsedClasses)
      if (!classesValid) {
        missingSections = [...missingSections, '## Classes (invalid or missing)']
      }
      logInfo("generate_world.ai_attempt_finished", {
        requestId,
        worldId: world.id,
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        outputLength: worldContent.length,
        missingSectionsCount: missingSections.length,
        missingSections,
      })

      if (missingSections.length > 0 && attempt < WORLD_GEN_MAX_ATTEMPTS) {
        await broadcastToChannel(supabaseUrl, serviceRoleKey, worldChannel, "world:progress", {
          attempt,
          maxAttempts: WORLD_GEN_MAX_ATTEMPTS,
        })
      }

      if (missingSections.length === 0) break
    }

    if (missingSections.length > 0) {
      throw new Error(`World generation incomplete after retries. Missing sections: ${missingSections.join(", ")}`)
    }

    // Save generated content to worlds table
    const cleanWorldContent = stripClassesFromContent(worldContent)

    await supabase
      .from("worlds")
      .update({ world_content: cleanWorldContent, classes: parsedClasses, status: "ready" })
      .eq("id", world.id)
    logInfo("generate_world.world_content_saved", { requestId, worldId: world.id })

    await broadcastToChannel(supabaseUrl, serviceRoleKey, worldChannel, "world:complete", {
      status: "ready",
    })

    // Trigger image generation (cover + map)
    const imageWebhookSecret = Deno.env.get("GENERATE_IMAGE_WEBHOOK_SECRET")
    const triggerImage = (imageType: string) =>
      fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${imageWebhookSecret}`,
        },
        body: JSON.stringify({
          entity_type: "world",
          entity_id: world.id,
          image_type: imageType,
        }),
      }).then((res) => {
        if (!res.ok) {
          logError(
            "generate_world.image_trigger_failed",
            { requestId, worldId: world.id, imageType, status: res.status },
            new Error(`generate-image responded with ${res.status}`),
          )
        } else {
          logInfo("generate_world.image_trigger_succeeded", {
            requestId,
            worldId: world.id,
            imageType,
          })
        }
      }).catch((err) => {
        logError(
          "generate_world.image_trigger_failed",
          { requestId, worldId: world.id, imageType },
          err,
        )
      })

    // @ts-ignore — EdgeRuntime is available in Supabase edge function environments
    EdgeRuntime.waitUntil(Promise.all([triggerImage("cover"), triggerImage("map")]))

    logInfo("generate_world.completed", {
      requestId,
      worldId: world.id,
      durationMs: Date.now() - requestStartedAt,
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    logError(
      "generate_world.failed",
      {
        requestId,
        worldId: world.id,
        durationMs: Date.now() - requestStartedAt,
      },
      err,
    )

    await supabase.from("worlds").update({ status: "error" }).eq("id", world.id)

    await broadcastToChannel(supabaseUrl, serviceRoleKey, worldChannel, "world:error", {
      status: "error",
    })

    return new Response("Generation failed", { status: 500 })
  }
})
