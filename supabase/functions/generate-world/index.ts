import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "jsr:@supabase/supabase-js@2"

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service role bypasses RLS for server writes
)

Deno.serve(async (req: Request) => {
  // Validate webhook secret — prevents anyone from calling this directly
  const webhookSecret = Deno.env.get("GENERATE_WORLD_WEBHOOK_SECRET")
  const authHeader = req.headers.get("authorization")
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const payload = await req.json()
  const campaign = payload.record

  if (!campaign?.id || !campaign?.world_description) {
    return new Response("Invalid payload", { status: 400 })
  }

  try {
    // Prompt injection defense: user content in user message, never in system
    const systemPrompt = `You are a fantasy world-builder. Generate a rich WORLD.md document for a tabletop RPG campaign based on the player's description.

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

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: campaign.world_description }],
    })

    const worldContent = aiResponse.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")

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
    }

    // Update status → 'lobby'.
    // Supabase Realtime Postgres Changes delivers this UPDATE to the subscribed
    // browser client automatically — no manual broadcast needed.
    await supabase
      .from("campaigns")
      .update({ status: "lobby" })
      .eq("id", campaign.id)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("generate-world failed:", err)

    // Update status → 'error'.
    // Same Realtime path delivers this to the client — error UI is shown.
    await supabase
      .from("campaigns")
      .update({ status: "error" })
      .eq("id", campaign.id)

    return new Response("Generation failed", { status: 500 })
  }
})
