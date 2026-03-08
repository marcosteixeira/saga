# Multiplayer Realtime Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three multiplayer bugs: (1) initial narration produces multiple messages instead of one, (2) player actions are not visible to other players in real-time, (3) each player sees a narration generated only for their own actions instead of a shared one for all players.

**Architecture:** The root cause of bugs 2 & 3 is that Supabase Edge Functions create a separate Deno isolate per WebSocket connection — the in-memory `sessions` Map is not shared between players' connections. Fix: move player-action broadcasting to Supabase Realtime postgres_changes (DB insert → all clients notified), and use a `pending_actions` DB table + a `round_in_progress` DB lock so all isolates share the same coordination state. Bug 1 is a simple join of the narration array before inserting.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase Edge Functions (Deno), Supabase Realtime (postgres_changes), supabase-js client

---

### Task 1: DB migration — add coordination schema and enable Realtime

**Files:**
- Create: `supabase/migrations/018_multiplayer_coordination.sql`

**Step 1: Write the migration**

```sql
-- Add client_id to messages so optimistic messages can be matched to DB rows
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id text;

-- Add round_in_progress lock to campaigns to prevent multiple isolates running
-- the same round concurrently
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS round_in_progress boolean NOT NULL DEFAULT false;

-- pending_actions table: shared DB state for round coordination across isolates.
-- Actions are inserted here when received and deleted atomically when a round fires.
CREATE TABLE IF NOT EXISTS pending_actions (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid    NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  player_id     uuid    NOT NULL,
  player_name   text    NOT NULL,
  client_id     text    NOT NULL,
  content       text    NOT NULL,
  client_timestamp bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, client_id)
);

-- Enable Realtime postgres_changes for the messages table so all connected
-- clients receive inserts regardless of which isolate performed them.
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

**Step 2: Apply migration**

```bash
supabase db push
```
Expected: migration applied with no errors.

**Step 3: Commit**

```bash
git add supabase/migrations/018_multiplayer_coordination.sql
git commit -m "feat: add pending_actions table, round_in_progress lock, enable messages Realtime"
```

---

### Task 2: Add `client_id` to the Message type

**Files:**
- Modify: `types/message.ts`

**Step 1: Update the type**

```ts
export type Message = {
  id: string
  campaign_id: string
  player_id: string | null
  content: string
  type: 'action' | 'narration' | 'system' | 'ooc'
  created_at: string
  client_id?: string | null
}

export type MessageInsert = Pick<Message, 'campaign_id' | 'content' | 'type'> & {
  player_id?: string
  client_id?: string | null
}
```

**Step 2: Commit**

```bash
git add types/message.ts
git commit -m "feat: add optional client_id to Message type"
```

---

### Task 3: Simplify CampaignSession state (edge function)

The in-memory `pendingMessages` and `nextRoundMessages` are replaced by the `pending_actions` DB table. Only the WebSocket connections Map, debounce timer, and isProcessing flag remain.

**Files:**
- Modify: `supabase/functions/game-session/state.ts`

**Step 1: Rewrite state.ts**

```ts
export interface CampaignSession {
  connections: Map<string, WebSocket>  // playerId → socket
  debounceTimer: ReturnType<typeof setTimeout> | null
  isProcessing: boolean  // true while this isolate is waiting for OpenAI / saving
}

export const sessions = new Map<string, CampaignSession>()

export function getOrCreateSession(campaignId: string): CampaignSession {
  let session = sessions.get(campaignId)
  if (!session) {
    session = {
      connections: new Map(),
      debounceTimer: null,
      isProcessing: false,
    }
    sessions.set(campaignId, session)
  }
  return session
}

export function registerConnection(campaignId: string, playerId: string, socket: WebSocket): void {
  const session = getOrCreateSession(campaignId)
  const previous = session.connections.get(playerId)
  if (previous && previous !== socket) {
    try {
      previous.close(1000, "replaced_by_new_connection")
    } catch {
      // ignore close errors on stale sockets
    }
  }
  session.connections.set(playerId, socket)
}

export function removeConnection(campaignId: string, playerId: string, socket?: WebSocket): void {
  const session = sessions.get(campaignId)
  if (!session) return
  const current = session.connections.get(playerId)
  if (!current) return
  if (socket && current !== socket) return
  session.connections.delete(playerId)
  if (session.connections.size === 0 && !session.isProcessing) {
    sessions.delete(campaignId)
  }
}

export function broadcastToAll(campaignId: string, message: unknown, excludePlayerId?: string): void {
  const session = sessions.get(campaignId)
  if (!session) return
  const payload = JSON.stringify(message)
  for (const [playerId, socket] of session.connections) {
    if (playerId === excludePlayerId) continue
    try {
      socket.send(payload)
    } catch {
      // ignore — stale sockets will be cleaned up on close events
    }
  }
}
```

**Step 2: Commit**

```bash
git add supabase/functions/game-session/state.ts
git commit -m "refactor: remove pendingMessages/nextRoundMessages from CampaignSession (now in DB)"
```

---

### Task 4: Simplify debounce (remove clientTimestamp arithmetic)

With actions now stored in DB, debounce timing no longer needs to align with `clientTimestamp`. Use simple fixed-delay from `Date.now()`.

**Files:**
- Modify: `supabase/functions/game-session/debounce.ts`

**Step 1: Rewrite debounce.ts**

```ts
import { sessions } from './state.ts'

export const DEBOUNCE_SECONDS = 10
const DEBOUNCE_MS = DEBOUNCE_SECONDS * 1000

/**
 * Reset the debounce timer. Clears any existing timer and starts a new one
 * that fires after DEBOUNCE_MS from now.
 */
export function resetDebounce(campaignId: string, onFire: () => void): void {
  const session = sessions.get(campaignId)
  if (!session) return

  if (session.debounceTimer !== null) {
    clearTimeout(session.debounceTimer)
  }

  session.debounceTimer = setTimeout(() => {
    session.debounceTimer = null
    onFire()
  }, DEBOUNCE_MS)
}

/**
 * Cancel the debounce timer without firing.
 */
export function cancelDebounce(campaignId: string): void {
  const session = sessions.get(campaignId)
  if (!session) return

  if (session.debounceTimer !== null) {
    clearTimeout(session.debounceTimer)
    session.debounceTimer = null
  }
}
```

**Step 2: Commit**

```bash
git add supabase/functions/game-session/debounce.ts
git commit -m "refactor: simplify debounce to fixed delay (no clientTimestamp arithmetic)"
```

---

### Task 5: Fix edge function — index.ts (all three bugs)

This is the main fix. Three changes in one file:
- Bug 1: join `narration[]` into a single string in `runFirstCall`
- Bug 2: insert action to `messages` + `pending_actions` immediately in `onmessage`; remove in-memory pending state
- Bug 3: `runRound` reads from `pending_actions` DB table with a `round_in_progress` lock; insert narration only (actions are already in DB)

**Files:**
- Modify: `supabase/functions/game-session/index.ts`

**Step 1: Replace the full index.ts**

Key changes explained inline with comments:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import OpenAI from "npm:openai"
import {
  sessions,
  getOrCreateSession,
  registerConnection,
  removeConnection,
  broadcastToAll,
} from "./state.ts"
import { resetDebounce } from "./debounce.ts"
import { buildGMSystemPrompt, buildFirstCallInput, isFirstCallResponse } from "./prompt.ts"
import { extractNarration } from "./openai.ts"

type LogMeta = Record<string, unknown>

function logInfo(event: string, meta: LogMeta = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...meta }))
}

function logError(event: string, meta: LogMeta = {}, err: unknown): void {
  const error = err instanceof Error
    ? { name: err.name, message: err.message, stack: err.stack }
    : { name: "UnknownError", message: String(err) }
  console.error(JSON.stringify({ level: "error", event, ...meta, error }))
}

async function clearPendingFirstCall(campaignId: string): Promise<void> {
  const { error } = await supabase
    .from("campaigns")
    .update({ last_response_id: null })
    .eq("id", campaignId)
  if (error) {
    logError("game_session.db_error", { campaignId, reason: "clear_pending_failed" }, error)
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!

const supabase = createClient(supabaseUrl, serviceRoleKey)
const openai = new OpenAI({ apiKey: openaiApiKey })

// ─── Types ────────────────────────────────────────────────────────────────────

interface DbMessage {
  id: string
  campaign_id: string
  player_id: string | null
  content: string
  type: 'action' | 'narration' | 'system' | 'ooc'
  created_at: string
  client_id: string | null
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authenticate(
  campaignId: string,
  token: string,
): Promise<{ playerId: string; playerName: string } | null> {
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    logInfo("game_session.auth_failed", { campaignId, reason: "invalid_jwt" })
    return null
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, character_name, username")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (playerError || !player) {
    logInfo("game_session.auth_failed", { campaignId, reason: "no_player_record", userId: user.id })
    return null
  }

  const playerName = (player.character_name ?? player.username ?? "Unknown") as string
  return { playerId: player.id as string, playerName }
}

// ─── OpenAI streaming helper ──────────────────────────────────────────────────

type StreamEvent = {
  type: string
  delta?: string
  response?: { output_text: string; id: string }
}

async function consumeStream(
  campaignId: string,
  stream: AsyncIterable<StreamEvent>,
): Promise<{ fullText: string; newResponseId: string }> {
  let fullText = ""
  let newResponseId = ""
  let chunkCount = 0

  for await (const event of stream) {
    if (event.type === "response.output_text.delta" && event.delta) {
      fullText += event.delta
      broadcastToAll(campaignId, { type: "chunk", content: event.delta })
      chunkCount++
      if (chunkCount % 20 === 0) {
        logInfo("game_session.openai_stream_chunk", { campaignId, chunkLength: event.delta.length })
      }
    }
    if (event.type === "response.completed" && event.response) {
      if (event.response.output_text !== undefined) {
        fullText = event.response.output_text
      }
      newResponseId = event.response.id
    }
  }

  return { fullText, newResponseId }
}

// ─── First Call ───────────────────────────────────────────────────────────────

async function runFirstCall(campaignId: string): Promise<void> {
  const startedAt = Date.now()

  const sessionRef = getOrCreateSession(campaignId)
  sessionRef.isProcessing = true

  const { error: pendingError } = await supabase
    .from("campaigns")
    .update({ last_response_id: "pending" })
    .eq("id", campaignId)
    .is("last_response_id", null)

  if (pendingError) {
    logError("game_session.db_error", { campaignId, reason: "pending_update_db_error" }, pendingError)
    sessionRef.isProcessing = false
    return
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("last_response_id, world_id")
    .eq("id", campaignId)
    .single()

  if (campaignError) {
    logError("game_session.db_error", { campaignId, reason: "recheck_pending_failed" }, campaignError)
    await clearPendingFirstCall(campaignId)
    sessionRef.isProcessing = false
    return
  }

  if (!campaign || campaign.last_response_id !== "pending") {
    logInfo("game_session.first_call_skipped", { campaignId, reason: "race_lost" })
    sessionRef.isProcessing = false
    return
  }

  try {
    const { data: world, error: worldError } = await supabase
      .from("worlds")
      .select("world_content")
      .eq("id", campaign.world_id)
      .single()

    if (worldError) throw worldError
    if (!world?.world_content) throw new Error("world_content missing")

    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("character_name, character_class, character_backstory, username")
      .eq("campaign_id", campaignId)

    if (playersError) throw playersError
    if (!players?.length) throw new Error("no players found")

    const systemPrompt = buildGMSystemPrompt(world.world_content as string, players)
    const input = buildFirstCallInput()

    logInfo("game_session.openai_call_started", { campaignId, previousResponseId: null })

    const rawStream = await openai.responses.create({
      model: "gpt-4o",
      instructions: systemPrompt,
      input,
      stream: true,
    } as Parameters<typeof openai.responses.create>[0])

    const { fullText, newResponseId } = await consumeStream(campaignId, rawStream as AsyncIterable<StreamEvent>)

    logInfo("game_session.openai_stream_complete", {
      campaignId,
      narrationLength: fullText.length,
      durationMs: Date.now() - startedAt,
    })

    let parsed: unknown
    try {
      parsed = JSON.parse(fullText)
    } catch {
      throw new Error(`Failed to parse OpenAI response as JSON: ${fullText.slice(0, 200)}`)
    }

    if (!isFirstCallResponse(parsed)) {
      throw new Error("OpenAI first-call response missing world_context")
    }

    const narrationParts = extractNarration(parsed)
    if (!narrationParts.length) {
      throw new Error("OpenAI first-call response has no narration")
    }

    // BUG 1 FIX: join all narration paragraphs into a single message instead of
    // inserting one DB row per paragraph. Multiple rows caused the chat to show
    // separate "Game Master" headers for each paragraph.
    const narrationContent = narrationParts.join("\n\n")

    logInfo("game_session.db_save_started", { campaignId, messageCount: 1 })

    const { data: savedMessages, error: insertError } = await supabase
      .from("messages")
      .insert([{
        campaign_id: campaignId,
        player_id: null,
        content: narrationContent,
        type: "narration" as const,
        client_id: null,
      }])
      .select("*")

    if (insertError) throw insertError

    await supabase
      .from("campaigns")
      .update({ last_response_id: newResponseId })
      .eq("id", campaignId)

    logInfo("game_session.db_save_complete", { campaignId, newResponseId })
    logInfo("game_session.round_complete", { campaignId, durationMs: Date.now() - startedAt })

    // Notify this isolate's connected players that the round is saved so they
    // can stop the loading screen. Other players receive the narration via
    // Supabase Realtime postgres_changes on the messages table.
    broadcastToAll(campaignId, { type: "round:saved" })
  } catch (err) {
    logError("game_session.openai_call_failed", { campaignId }, err)
    await clearPendingFirstCall(campaignId)
    broadcastToAll(campaignId, { type: "error", message: "Failed to generate opening narration" })
  } finally {
    sessionRef.isProcessing = false
  }
}

// ─── Round ────────────────────────────────────────────────────────────────────
// BUG 3 FIX: runRound no longer takes a `pending` parameter from in-memory
// state. It reads pending_actions from DB so all isolates share the same data,
// and uses a round_in_progress DB lock so only one isolate fires per round.

async function runRound(campaignId: string): Promise<void> {
  const startedAt = Date.now()

  // Try to acquire the round lock. Only the isolate that successfully flips
  // round_in_progress from false → true will proceed.
  await supabase
    .from("campaigns")
    .update({ round_in_progress: true })
    .eq("id", campaignId)
    .eq("round_in_progress", false)

  // Re-fetch to confirm we won the lock (Supabase update returns no error on
  // zero rows matched, so we must check the current value).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("round_in_progress, last_response_id")
    .eq("id", campaignId)
    .single()

  if (!campaign?.round_in_progress) {
    logInfo("game_session.round_lock_lost", { campaignId })
    return
  }

  try {
    // Atomically read and delete all pending actions for this campaign.
    // .delete().select() returns the rows that were deleted by THIS query.
    const { data: pendingActions, error: pendingError } = await supabase
      .from("pending_actions")
      .delete()
      .eq("campaign_id", campaignId)
      .select("*")

    if (pendingError) throw pendingError

    if (!pendingActions?.length) {
      logInfo("game_session.round_skipped", { campaignId, reason: "no_pending_actions" })
      return
    }

    logInfo("game_session.openai_call_started", {
      campaignId,
      pendingCount: pendingActions.length,
      previousResponseId: campaign.last_response_id,
    })

    const input = JSON.stringify(
      pendingActions.map((a) => ({
        clientId: a.client_id,
        playerName: a.player_name,
        content: a.content,
      }))
    )

    const rawStream = await openai.responses.create({
      model: "gpt-4o",
      previous_response_id: campaign.last_response_id,
      input,
      stream: true,
    } as Parameters<typeof openai.responses.create>[0])

    const { fullText, newResponseId } = await consumeStream(campaignId, rawStream as AsyncIterable<StreamEvent>)

    logInfo("game_session.openai_stream_complete", {
      campaignId,
      narrationLength: fullText.length,
      durationMs: Date.now() - startedAt,
    })

    // Subsequent responses are plain prose — join into a single narration message.
    const narrationContent = fullText.trim()
    if (!narrationContent) throw new Error("Empty narration returned")

    logInfo("game_session.db_save_started", { campaignId })

    // BUG 2 FIX: Action messages are already in DB (inserted in onmessage).
    // Only insert the narration here. All clients receive both the prior action
    // rows and this narration row via Supabase Realtime postgres_changes.
    const { error: narrationInsertError } = await supabase
      .from("messages")
      .insert([{
        campaign_id: campaignId,
        player_id: null,
        content: narrationContent,
        type: "narration" as const,
        client_id: null,
      }])

    if (narrationInsertError) throw narrationInsertError

    await supabase
      .from("campaigns")
      .update({ last_response_id: newResponseId })
      .eq("id", campaignId)

    logInfo("game_session.db_save_complete", { campaignId, newResponseId })
    logInfo("game_session.round_complete", { campaignId, durationMs: Date.now() - startedAt })

    // Signal this isolate's connected players that streaming is done.
    // Other players already receive the narration via Realtime.
    broadcastToAll(campaignId, { type: "round:saved" })
  } catch (err) {
    logError("game_session.openai_call_failed", { campaignId }, err)
    broadcastToAll(campaignId, { type: "error", message: "Failed to generate narration" })
  } finally {
    // Release the round lock unconditionally.
    await supabase
      .from("campaigns")
      .update({ round_in_progress: false })
      .eq("id", campaignId)

    const session = sessions.get(campaignId)
    if (session) {
      session.isProcessing = false

      // If new pending_actions arrived while we were processing, schedule
      // another round after a short delay so they are not orphaned.
      const { data: remaining } = await supabase
        .from("pending_actions")
        .select("id")
        .eq("campaign_id", campaignId)
        .limit(1)

      if (remaining?.length) {
        resetDebounce(campaignId, () => fireDebounce(campaignId))
      }
    }
  }
}

// ─── Debounce fire ────────────────────────────────────────────────────────────

async function fireDebounce(campaignId: string): Promise<void> {
  const session = sessions.get(campaignId)
  if (!session) return
  if (session.isProcessing) return  // another round is in progress on this isolate

  logInfo("game_session.debounce_fired", { campaignId })
  session.isProcessing = true
  await runRound(campaignId)
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const campaignId = url.searchParams.get("campaignId")
  const token = url.searchParams.get("jwt")

  if (!campaignId || !token) {
    return new Response("Missing campaignId or token", { status: 400 })
  }

  const upgradeHeader = req.headers.get("upgrade")
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 })
  }

  const auth = await authenticate(campaignId, token)
  if (!auth) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { playerId, playerName } = auth

  const { socket, response } = Deno.upgradeWebSocket(req)

  socket.onopen = () => {
    logInfo("game_session.connection_opened", { campaignId, playerId, playerName })
    registerConnection(campaignId, playerId, socket)

    const handleOpen = async () => {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("last_response_id")
        .eq("id", campaignId)
        .single()

      if (campaign?.last_response_id === null) {
        await runFirstCall(campaignId)
      }
      // If last_response_id is set (or 'pending'), the client will receive
      // existing/incoming messages via Supabase Realtime postgres_changes.
      // No unicast needed here.
    }

    // @ts-ignore — EdgeRuntime.waitUntil keeps the isolate alive for the promise
    if (typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(handleOpen())
    } else {
      handleOpen().catch((err) =>
        logError("game_session.onopen_error", { campaignId, playerId }, err)
      )
    }
  }

  socket.onmessage = (event) => {
    let msg: { type?: string; id?: string; content?: string; timestamp?: number }
    try {
      msg = JSON.parse(event.data as string)
    } catch {
      return
    }

    if (msg.type !== "action" || !msg.id || !msg.content) return

    logInfo("game_session.action_received", { campaignId, playerId, messageLength: msg.content.length })

    const clientTimestamp = msg.timestamp ?? Date.now()

    // BUG 2 FIX: Insert action to messages immediately so Supabase Realtime
    // notifies ALL connected clients (regardless of isolate) in real time.
    // Also insert to pending_actions for round coordination.
    const saveAction = async () => {
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          campaign_id: campaignId,
          player_id: playerId,
          content: msg.content,
          type: "action" as const,
          client_id: msg.id,
        })

      if (msgError) {
        logError("game_session.db_error", { campaignId, reason: "action_insert_failed" }, msgError)
        return
      }

      const { error: pendingError } = await supabase
        .from("pending_actions")
        .insert({
          campaign_id: campaignId,
          player_id: playerId,
          player_name: playerName,
          client_id: msg.id,
          content: msg.content,
          client_timestamp: clientTimestamp,
        })

      if (pendingError) {
        // Duplicate client_id (e.g. reconnect replay) — not a fatal error.
        logInfo("game_session.pending_action_skip", { campaignId, reason: pendingError.message })
        return
      }
    }

    const session = getOrCreateSession(campaignId)
    if (session.isProcessing) {
      // Round is in progress on this isolate; save to DB and the finally block
      // in runRound will schedule a follow-up round when it detects remaining
      // pending_actions.
      saveAction().catch((err) =>
        logError("game_session.save_action_error", { campaignId }, err)
      )
    } else {
      saveAction()
        .then(() => resetDebounce(campaignId, () => fireDebounce(campaignId)))
        .catch((err) =>
          logError("game_session.save_action_error", { campaignId }, err)
        )
    }
  }

  socket.onclose = (event) => {
    logInfo("game_session.connection_closed", { campaignId, playerId, reason: event.reason || "normal" })
    removeConnection(campaignId, playerId, socket)
  }

  socket.onerror = (event) => {
    const message = (event as unknown as { message?: string }).message || String(event)
    logError("game_session.connection_error", { campaignId, playerId }, new Error(message))
  }

  return response
})
```

**Step 2: Commit**

```bash
git add supabase/functions/game-session/index.ts
git commit -m "fix: multiplayer isolation — insert actions immediately, DB round lock, single narration message"
```

---

### Task 6: Update GameClient.tsx — add Realtime subscription, simplify WS handler

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx`

**Context:** The WebSocket `onmessage` handler currently handles three events: `player:action` (add other players' actions as optimistic), `round:saved` (clear optimistic, add DB messages, stop streaming, transition loading→active), and `chunk` (streaming). With the Realtime fix:
- `player:action` is removed — all message inserts arrive via Realtime postgres_changes
- `round:saved` becomes signal-only (no payload) — just stops streaming
- `chunk` unchanged

A new Supabase Realtime subscription is added in a separate `useEffect` that:
1. Receives every new `messages` INSERT for this campaign
2. Removes the matching optimistic message (by `client_id`)
3. Adds the DB row to `liveMessages` (with dedup)
4. Transitions `loading → active` when the first `narration` message arrives

**Step 1: Remove `player:action` block and simplify `round:saved` in the WebSocket `onmessage` handler**

Find this block (around line 2215):
```ts
        if (msg.type === 'player:action') {
          console.log('[game-session] player:action', {
            id: msg.id,
            playerName: msg.playerName,
            content: msg.content
          });
          const optimistic: OptimisticMessage = {
            id: msg.id as string,
            playerId: msg.playerId as string,
            playerName: msg.playerName as string,
            content: msg.content as string,
            timestamp: msg.timestamp as number,
            isOwn: false
          };
          setOptimisticMessages((prev) => {
            if (prev.some((m) => m.id === optimistic.id)) return prev;
            return [...prev, optimistic];
          });
        }
```

Delete that entire `player:action` block.

Find the `round:saved` block (around line 2240):
```ts
        if (msg.type === 'round:saved') {
          const roundMessages = msg.messages as Array<{
            clientId: string | null;
            dbMessage: Message;
          }>;
          console.log('[game-session] round:saved', {
            messageCount: roundMessages.length,
            messages: roundMessages
          });
          setIsStreaming(false);
          setStreamingContent('');

          const confirmedClientIds = new Set(
            roundMessages
              .filter((m) => m.clientId !== null)
              .map((m) => m.clientId as string)
          );
          setOptimisticMessages((prev) =>
            prev.filter((m) => !confirmedClientIds.has(m.id))
          );

          const newDbMessages = roundMessages.map((m) => m.dbMessage);
          setLiveMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const toAdd = newDbMessages.filter((m) => !existingIds.has(m.id));
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
          });

          setViewState((prev) => (prev === 'loading' ? 'active' : prev));
        }
```

Replace with:
```ts
        if (msg.type === 'round:saved') {
          // Narration and action messages are delivered via Supabase Realtime
          // postgres_changes. This event only signals that streaming is done.
          console.log('[game-session] round:saved (streaming complete)');
          setIsStreaming(false);
          setStreamingContent('');
        }
```

**Step 2: Add Realtime subscription useEffect**

After the existing WebSocket `useEffect` (which ends around line 2301 with `}, [campaign.id]);`), add a new effect:

```ts
  // Supabase Realtime: subscribe to new message inserts for this campaign.
  // This is the primary delivery path for player actions and narration —
  // it works across all edge function isolates, fixing the multiplayer isolation bug.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game-messages-${campaign.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `campaign_id=eq.${campaign.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          console.log('[realtime] messages INSERT', { id: newMsg.id, type: newMsg.type, client_id: newMsg.client_id });

          // Remove the matching optimistic message (own action confirmed by DB).
          if (newMsg.client_id) {
            setOptimisticMessages((prev) =>
              prev.filter((m) => m.id !== newMsg.client_id)
            );
          }

          // Add to live messages (dedup by id).
          setLiveMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });

          // Transition loading → active when the first narration arrives.
          if (newMsg.type === 'narration') {
            setViewState((prev) => (prev === 'loading' ? 'active' : prev));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaign.id]);
```

**Step 3: Commit**

```bash
git add app/campaign/[slug]/game/GameClient.tsx
git commit -m "fix: subscribe to Realtime postgres_changes for messages — shared action/narration delivery across isolates"
```

---

### Task 7: Deploy edge function

```bash
supabase functions deploy game-session
```

Expected: deploy succeeds. Verify in Supabase dashboard under Edge Functions.

**Commit** (nothing to commit for deploy itself — edge function code was already committed).

---

### Task 8: Manual multiplayer test

Open two browser windows (different users) and join the same campaign.

**Checklist:**
- [ ] Initial narration appears as **one message** under a single "Game Master" header (not multiple separate ones)
- [ ] Player 1 sends a message → **Player 2 sees it immediately** in their chat (and vice versa)
- [ ] After 10 seconds of no new actions, the GM narrates → **both players see the same narration** in one message that references both players' actions
- [ ] The streaming "GM typing" indicator works for at least the player whose connection triggered the round
- [ ] Reconnecting mid-session still shows all prior messages

---

## Summary of Root Causes

| Bug | Root cause | Fix |
|-----|-----------|-----|
| Multiple initial narration messages | `extractNarration` returns `string[]`; each element was a separate DB row | Join array with `\n\n` before inserting (one row) |
| Player actions invisible to others | Each WebSocket = separate Deno isolate; `broadcastToAll` only reaches same-isolate sockets | Insert action to `messages` immediately; all clients subscribe via Supabase Realtime postgres_changes |
| Per-player narration | Each isolate had its own `pendingMessages`; each fired a separate `runRound` with only its player's actions | `pending_actions` DB table (shared across isolates) + `round_in_progress` DB lock (only one isolate runs a round) |
