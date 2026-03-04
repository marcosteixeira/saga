import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { getMissingRequiredSections } from "./world-content.ts"
import { logError, logInfo } from "./logging.ts"
import { broadcastToChannel } from "./broadcast.ts"

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
})

const WORLD_GEN_MAX_TOKENS = 4096
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

  // Validate webhook secret — prevents anyone from calling this directly
  const webhookSecret = Deno.env.get("GENERATE_WORLD_WEBHOOK_SECRET")
  const authHeader = req.headers.get("authorization")
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    logInfo("generate_world.auth_failed", { requestId })
    return new Response("Unauthorized", { status: 401 })
  }
  logInfo("generate_world.auth_validated", { requestId })

  const payload = await req.json()
  const campaign = payload.record

  if (!campaign?.id || !campaign?.world_description) {
    logInfo("generate_world.payload_invalid", {
      requestId,
      hasCampaignId: Boolean(campaign?.id),
      hasWorldDescription: Boolean(campaign?.world_description),
    })
    return new Response("Invalid payload", { status: 400 })
  }
  logInfo("generate_world.payload_validated", {
    requestId,
    campaignId: campaign.id,
    worldDescriptionLength: campaign.world_description.length,
  })

  try {
    // Broadcast that generation has started so the UI can show immediate feedback
    await broadcastToChannel(supabaseUrl, serviceRoleKey, campaign.id, "world:started", {
      status: "generating",
    })

    // Prompt injection defense: user content in user message, never in system
    const systemPrompt = `You are a world-builder for tabletop RPG campaigns. Generate a rich WORLD.md document faithful to the genre, tone, and setting described by the player. Do NOT impose a fantasy genre — if the player describes a sci-fi, horror, Western, crime, or any other setting, match it exactly.

Output a Markdown document with exactly these sections (use ## headings):
## World Name
## Overview
## History
## Geography
## Factions
## Tone
## Current Situation
## Starting Hooks

Be evocative and specific. Starting Hooks must list 2-3 adventure hooks players can immediately pursue. Output ONLY the Markdown document, no preamble.`

    let worldContent = ""
    let missingSections: string[] = []

    for (let attempt = 1; attempt <= WORLD_GEN_MAX_ATTEMPTS; attempt++) {
      const attemptStartedAt = Date.now()
      const retryInstruction =
        attempt === 1
          ? ""
          : `\n\nYour previous response was incomplete. Regenerate WORLD.md and include all required sections exactly as written. Keep each section concise (2-4 paragraphs or 3-6 bullet points).\nMissing sections: ${missingSections.join(", ")}`

      logInfo("generate_world.ai_attempt_started", {
        requestId,
        campaignId: campaign.id,
        attempt,
        maxAttempts: WORLD_GEN_MAX_ATTEMPTS,
        retryMissingSections: missingSections,
      })

      const aiResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: WORLD_GEN_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: `${campaign.world_description}${retryInstruction}` }],
      })

      worldContent = aiResponse.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("")

      missingSections = getMissingRequiredSections(worldContent)
      logInfo("generate_world.ai_attempt_finished", {
        requestId,
        campaignId: campaign.id,
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        outputLength: worldContent.length,
        missingSectionsCount: missingSections.length,
        missingSections,
      })

      if (missingSections.length > 0 && attempt < WORLD_GEN_MAX_ATTEMPTS) {
        // Broadcast progress on retry so UI can show attempt info
        await broadcastToChannel(supabaseUrl, serviceRoleKey, campaign.id, "world:progress", {
          attempt,
          maxAttempts: WORLD_GEN_MAX_ATTEMPTS,
        })
      }

      if (missingSections.length === 0) break
    }

    if (missingSections.length > 0) {
      logInfo("generate_world.ai_validation_failed", {
        requestId,
        campaignId: campaign.id,
        missingSectionsCount: missingSections.length,
        missingSections,
      })
      throw new Error(`World generation incomplete after retries. Missing sections: ${missingSections.join(", ")}`)
    }

    // Initialize all 5 campaign memory files
    const files = [
      { campaign_id: campaign.id, filename: "WORLD.md", content: worldContent },
      { campaign_id: campaign.id, filename: "CHARACTERS.md", content: "" },
      { campaign_id: campaign.id, filename: "NPCS.md", content: "" },
      { campaign_id: campaign.id, filename: "LOCATIONS.md", content: "" },
      { campaign_id: campaign.id, filename: "MEMORY.md", content: "Campaign just started." },
    ]
    for (const file of files) {
      await supabase
        .from("campaign_files")
        .upsert(file, { onConflict: "campaign_id,filename" })
      logInfo("generate_world.db_file_upserted", {
        requestId,
        campaignId: campaign.id,
        filename: file.filename,
        contentLength: file.content.length,
      })
    }

    // Update DB status → 'lobby' (for page reload state)
    await supabase
      .from("campaigns")
      .update({ status: "lobby" })
      .eq("id", campaign.id)
    logInfo("generate_world.status_updated", {
      requestId,
      campaignId: campaign.id,
      status: "lobby",
    })

    // Broadcast completion event so the UI updates without a full page reload
    await broadcastToChannel(supabaseUrl, serviceRoleKey, campaign.id, "world:complete", {
      status: "lobby",
    })

    // Trigger image generation in the background without blocking the response.
    // Use waitUntil so the runtime stays alive until the fetch completes.
    const imageWebhookSecret = Deno.env.get("GENERATE_IMAGE_WEBHOOK_SECRET")
    const imagePromise = fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${imageWebhookSecret}`,
      },
      body: JSON.stringify({
        campaign_id: campaign.id,
        type: "cover",
      }),
    }).then((res) => {
      if (!res.ok) {
        logError(
          "generate_world.image_trigger_failed",
          { requestId, campaignId: campaign.id, status: res.status },
          new Error(`generate-image responded with ${res.status}`),
        )
      } else {
        logInfo("generate_world.image_trigger_succeeded", {
          requestId,
          campaignId: campaign.id,
        })
      }
    }).catch((err) => {
      logError(
        "generate_world.image_trigger_failed",
        { requestId, campaignId: campaign.id },
        err,
      )
    })
    // @ts-ignore — EdgeRuntime is available in Supabase edge function environments
    EdgeRuntime.waitUntil(imagePromise)

    logInfo("generate_world.completed", {
      requestId,
      campaignId: campaign.id,
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
        campaignId: campaign.id,
        durationMs: Date.now() - requestStartedAt,
      },
      err,
    )

    // Update DB status → 'error' (for page reload state)
    await supabase
      .from("campaigns")
      .update({ status: "error" })
      .eq("id", campaign.id)
    logInfo("generate_world.status_updated", {
      requestId,
      campaignId: campaign.id,
      status: "error",
    })

    // Broadcast error event so the UI can immediately show the error state
    await broadcastToChannel(supabaseUrl, serviceRoleKey, campaign.id, "world:error", {
      status: "error",
    })

    return new Response("Generation failed", { status: 500 })
  }
})
