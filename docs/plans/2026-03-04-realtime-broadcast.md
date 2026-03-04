# Realtime Broadcast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Postgres Changes Realtime with explicit Supabase Realtime Broadcast events — the edge function publishes events at key generation milestones, and the UI subscribes to those events directly.

**Architecture:** The edge function calls the Supabase Realtime Broadcast REST API (`POST /realtime/v1/api/broadcast`) authenticated with the service role key. Events are published on the channel `campaign:<id>`. The setup page replaces its `postgres_changes` subscription with a `broadcast` subscription on the same channel. The DB status update stays (for page-load state), but the real-time notification path switches from implicit Postgres Changes to explicit Broadcast.

**Tech Stack:** Supabase Realtime Broadcast REST API, Next.js client component (`createClient()`), Vitest

---

### Task 1: Create `broadcast.ts` helper in the edge function

**Files:**
- Create: `supabase/functions/generate-world/broadcast.ts`
- Create: `supabase/functions/generate-world/__tests__/broadcast.test.ts`

**Step 1: Write the failing tests first**

Create `supabase/functions/generate-world/__tests__/broadcast.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { broadcastToChannel } from '../broadcast'

describe('broadcastToChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs to the Supabase Realtime broadcast endpoint', async () => {
    await broadcastToChannel(
      'https://abc.supabase.co',
      'service-role-key',
      'campaign-123',
      'world:complete',
      { status: 'lobby' },
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'https://abc.supabase.co/realtime/v1/api/broadcast',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('sends the correct channel topic, event, and payload', async () => {
    await broadcastToChannel(
      'https://abc.supabase.co',
      'service-role-key',
      'campaign-123',
      'world:error',
      { status: 'error' },
    )

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(body).toEqual({
      messages: [
        {
          topic: 'campaign:campaign-123',
          event: 'world:error',
          payload: { status: 'error' },
        },
      ],
    })
  })

  it('includes the apikey header with the service role key', async () => {
    await broadcastToChannel(
      'https://abc.supabase.co',
      'my-service-role-key',
      'campaign-456',
      'world:complete',
      {},
    )

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['apikey']).toBe('my-service-role-key')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('does not throw when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))

    await expect(
      broadcastToChannel('https://abc.supabase.co', 'key', 'campaign-1', 'world:complete', {})
    ).resolves.toBeUndefined()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test supabase/functions/generate-world/__tests__/broadcast.test.ts
```

Expected: FAIL with "Cannot find module '../broadcast'"

**Step 3: Create the implementation**

Create `supabase/functions/generate-world/broadcast.ts`:

```typescript
export type BroadcastPayload = Record<string, unknown>

export async function broadcastToChannel(
  supabaseUrl: string,
  serviceRoleKey: string,
  campaignId: string,
  event: string,
  payload: BroadcastPayload,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({
        messages: [{
          topic: `campaign:${campaignId}`,
          event,
          payload,
        }],
      }),
    })
  } catch {
    // Broadcast failures must never crash the edge function
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test supabase/functions/generate-world/__tests__/broadcast.test.ts
```

Expected: 4 tests pass

**Step 5: Commit**

```bash
git add supabase/functions/generate-world/broadcast.ts supabase/functions/generate-world/__tests__/broadcast.test.ts
git commit -m "feat: add Realtime broadcast helper for edge function"
```

---

### Task 2: Update edge function to broadcast events at key milestones

**Files:**
- Modify: `supabase/functions/generate-world/index.ts`

**Step 1: Read current file**

Read `supabase/functions/generate-world/index.ts` to understand current flow before editing.

**Step 2: Replace the file with the updated version**

Replace the full content of `supabase/functions/generate-world/index.ts`:

```typescript
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
```

**Key changes from original:**
- Imports `broadcastToChannel` from `./broadcast.ts`
- Extracts `supabaseUrl` and `serviceRoleKey` as top-level constants (reused by both `createClient` and `broadcastToChannel`)
- Broadcasts `world:progress` after failed AI attempts (retry scenario)
- Broadcasts `world:complete` after DB status → 'lobby'
- Broadcasts `world:error` after DB status → 'error'

**Step 3: Verify existing tests still pass**

```bash
yarn test supabase/functions/generate-world/__tests__/world-content.test.ts
yarn test supabase/functions/generate-world/__tests__/logging.test.ts
```

Expected: All existing tests still pass (no changes to world-content.ts or logging.ts)

**Step 4: Commit**

```bash
git add supabase/functions/generate-world/index.ts
git commit -m "feat: broadcast Realtime events at world generation milestones"
```

---

### Task 3: Update setup page to subscribe to Broadcast instead of Postgres Changes

**Files:**
- Modify: `app/campaign/[id]/setup/page.tsx`

**Step 1: Read current file**

Read `app/campaign/[id]/setup/page.tsx` to understand the current `postgres_changes` subscription.

**Step 2: Replace the Realtime subscription**

The current subscription block is in the `useEffect`. Replace the entire `useEffect` body's channel subscription (lines 68–98) with a `broadcast` subscription. The rest of the component stays the same.

The channel must match the topic the edge function broadcasts to: `campaign:<campaignId>`.

Replace only the channel subscription portion:

**OLD** (lines 68–98):
```typescript
const channel = supabase
  .channel(`campaign-setup-${campaignId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'campaigns',
      filter: `id=eq.${campaignId}`,
    },
    async () => {
      if (!mounted) return

      try {
        const data = await loadCampaign()
        if (!mounted) return

        setBusy(data.campaign.status === 'generating')
        setError(
          data.campaign.status === 'error'
            ? 'World generation failed. You can retry from this setup page.'
            : null
        )
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to refresh campaign status.')
        setBusy(false)
      }
    }
  )
  .subscribe()
```

**NEW**:
```typescript
const channel = supabase
  .channel(`campaign:${campaignId}`)
  .on('broadcast', { event: 'world:progress' }, ({ payload }) => {
    if (!mounted) return
    setStatusText(
      `Generating world... (attempt ${payload.attempt}/${payload.maxAttempts})`
    )
  })
  .on('broadcast', { event: 'world:complete' }, async () => {
    if (!mounted) return
    try {
      const data = await loadCampaign()
      if (!mounted) return
      setBusy(false)
      setError(null)
      setStatusText(statusMessage(data.campaign.status))
    } catch (err) {
      if (!mounted) return
      setError(err instanceof Error ? err.message : 'Failed to load world data.')
      setBusy(false)
    }
  })
  .on('broadcast', { event: 'world:error' }, () => {
    if (!mounted) return
    setBusy(false)
    setError('World generation failed. You can retry from this setup page.')
    setStatusText(statusMessage('error'))
  })
  .subscribe()
```

**Step 3: Verify TypeScript compiles**

```bash
cd /path/to/saga && yarn tsc --noEmit
```

Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add app/campaign/[id]/setup/page.tsx
git commit -m "feat: switch setup page to Realtime Broadcast subscription"
```

---

### Task 4: Manual smoke test (verification)

This cannot be unit tested — it requires the live Supabase environment.

**Step 1:** Start dev server: `yarn dev`

**Step 2:** Open browser console on the campaign setup page (`/campaign/<new-id>/setup`)

**Step 3:** Create a new campaign. Verify in the console:
- The Supabase Realtime channel `campaign:<id>` is subscribed (no `CHANNEL_ERROR` in console)
- When generation completes: the page transitions from "generating" state to showing the world preview — triggered by the `world:complete` broadcast event (not a page reload)
- If generation fails: the error UI appears immediately via `world:error`

**Step 4:** Check Supabase Realtime logs (Supabase Dashboard → Realtime) to confirm broadcast events are being received.
