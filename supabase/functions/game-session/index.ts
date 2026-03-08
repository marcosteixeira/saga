import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk"
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
import { buildMessageHistory, type MsgRow } from "./history.ts"
import { consumeStream, type StreamEvent } from "./stream.ts"
import { extractJwtFromProtocolHeader } from "./ws-auth.ts"

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
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!

const supabase = createClient(supabaseUrl, serviceRoleKey)
const anthropic = new Anthropic({ apiKey: anthropicApiKey })

// ─── Types ────────────────────────────────────────────────────────────────────

interface DbMessage {
  id: string
  campaign_id: string
  player_id: string | null
  content: string
  type: 'action' | 'narration' | 'system' | 'ooc'
  created_at: string
  client_id: string | null
  processed: boolean
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

// ─── First Call ───────────────────────────────────────────────────────────────

async function runFirstCall(campaignId: string): Promise<void> {
  const startedAt = Date.now()

  // Mark processing so removeConnection doesn't delete the session while the
  // first call is in-flight (the socket may drop during a cold-start restart).
  const sessionRef = getOrCreateSession(campaignId)
  sessionRef.isProcessing = true

  // Attempt to claim first-call slot via optimistic update on null → 'pending'
  const { error: pendingError } = await supabase
    .from("campaigns")
    .update({ last_response_id: "pending" })
    .eq("id", campaignId)
    .is("last_response_id", null)

  // Note: Supabase .update() does not error when zero rows match (race-lost case).
  // Only a true DB connectivity error reaches here. The re-fetch below is the actual guard.
  if (pendingError) {
    logError("game_session.db_error", { campaignId, reason: "pending_update_db_error" }, pendingError)
    sessionRef.isProcessing = false
    return
  }

  // Re-fetch to confirm we won the race
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
    if (!world?.world_content) {
      throw new Error("world_content missing")
    }

    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("character_name, character_class, character_backstory, username")
      .eq("campaign_id", campaignId)

    if (playersError) throw playersError
    if (!players?.length) {
      throw new Error("no players found")
    }

    const systemPrompt = buildGMSystemPrompt(world.world_content as string, players)
    const input = buildFirstCallInput()

    logInfo("game_session.openai_call_started", { campaignId, previousResponseId: null })

    const rawStream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user" as const, content: input }],
    })

    const { fullText } = await consumeStream(
      campaignId,
      rawStream as AsyncIterable<StreamEvent>,
      (campaignId, chunk) => broadcastToAll(campaignId, { type: "chunk", content: chunk }),
      (campaignId, chunkLength) => logInfo("game_session.openai_stream_chunk", { campaignId, chunkLength }),
      true,
    )

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

    // Bug 1 fix: join all narration parts into a single string → one DB row
    const narrationParts = extractNarration(parsed)
    if (!narrationParts.length) {
      throw new Error("OpenAI first-call response has no narration")
    }
    const narrationContent = narrationParts.join("\n\n")

    logInfo("game_session.db_save_started", { campaignId, messageCount: 1 })

    const { error: insertError } = await supabase
      .from("messages")
      .insert([{
        campaign_id: campaignId,
        player_id: null,
        content: narrationContent,
        type: "narration" as const,
        client_id: null,
      }])

    if (insertError) throw insertError

    await supabase
      .from("campaigns")
      .update({ last_response_id: "done" })
      .eq("id", campaignId)

    logInfo("game_session.db_save_complete", { campaignId })
    logInfo("game_session.round_complete", { campaignId, durationMs: Date.now() - startedAt })

    // Clients receive the narration message via Realtime postgres_changes.
    broadcastToAll(campaignId, { type: "round:saved" })
  } catch (err) {
    logError("game_session.openai_call_failed", { campaignId }, err)
    // Reset so the next connection can retry rather than hanging on 'pending' forever.
    await clearPendingFirstCall(campaignId)
    broadcastToAll(campaignId, { type: "error", message: "Failed to generate opening narration" })
  } finally {
    sessionRef.isProcessing = false
  }
}

// ─── Round ────────────────────────────────────────────────────────────────────

async function runRound(campaignId: string): Promise<void> {
  const startedAt = Date.now()
  let lockAcquired = false

  try {
    // Try to acquire the round lock
    await supabase
      .from("campaigns")
      .update({ round_in_progress: true })
      .eq("id", campaignId)
      .eq("round_in_progress", false)

    // Re-fetch to confirm we won (Supabase update doesn't error on zero rows matched)
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("round_in_progress, last_response_id")
      .eq("id", campaignId)
      .single()

    if (!campaign?.round_in_progress) {
      logInfo("game_session.round_lock_lost", { campaignId })
      return  // finally will still run and reset isProcessing (lock was NOT acquired)
    }

    lockAcquired = true

    // Bug 3 fix: atomically claim all unprocessed action messages for this campaign.
    // UPDATE...RETURNING is atomic: only rows updated by THIS query are returned.
    const { data: claimedActions, error: claimError } = await supabase
      .from("messages")
      .update({ processed: true })
      .eq("campaign_id", campaignId)
      .eq("type", "action")
      .eq("processed", false)
      .select("*")

    if (claimError) throw claimError

    if (!claimedActions?.length) {
      logInfo("game_session.round_skipped", { campaignId, reason: "no_pending_actions" })
      return  // finally will release the lock and reset isProcessing
    }

    // Look up player names for the claimed actions (messages table has no player_name column)
    const playerIds = [...new Set(claimedActions.map((a) => a.player_id).filter(Boolean))]
    const { data: players } = await supabase
      .from("players")
      .select("id, character_name, username")
      .in("id", playerIds)

    const playerNameMap = new Map(
      (players ?? []).map((p) => [
        p.id as string,
        ((p.character_name ?? p.username ?? "Unknown") as string),
      ])
    )

    // Load full conversation history for this campaign
    const { data: historyRows, error: historyError } = await supabase
      .from("messages")
      .select("content, type, players(character_name, username)")
      .eq("campaign_id", campaignId)
      .in("type", ["action", "narration"])
      .eq("processed", true)
      .order("created_at", { ascending: true })

    if (historyError) throw historyError

    const history = buildMessageHistory((historyRows ?? []) as MsgRow[])

    // Build current round user message
    const currentInput = JSON.stringify(
      claimedActions.map((a) => ({
        playerName: playerNameMap.get(a.player_id ?? "") ?? "Unknown",
        content: a.content,
      }))
    )

    // Apply cache breakpoint to last history message (caches everything before it)
    const messagesWithCache = history.map((msg, i) => {
      if (i === history.length - 1 && history.length > 0) {
        return {
          ...msg,
          content: [{ type: "text" as const, text: msg.content as string, cache_control: { type: "ephemeral" as const } }],
        }
      }
      return msg
    })

    const allMessages = [
      ...messagesWithCache,
      { role: "user" as const, content: currentInput },
    ]

    const { data: world, error: worldError } = await supabase
      .from("worlds")
      .select("world_content")
      .eq("id", (await supabase.from("campaigns").select("world_id").eq("id", campaignId).single()).data?.world_id)
      .single()

    if (worldError) throw worldError

    const { data: allPlayers, error: allPlayersError } = await supabase
      .from("players")
      .select("character_name, character_class, character_backstory, username")
      .eq("campaign_id", campaignId)

    if (allPlayersError) throw allPlayersError

    const systemPrompt = buildGMSystemPrompt(world?.world_content as string, allPlayers ?? [])

    logInfo("game_session.openai_call_started", {
      campaignId,
      pendingCount: claimedActions.length,
      historyLength: history.length,
    })

    const rawStream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }],
      messages: allMessages,
    })

    const { fullText } = await consumeStream(
      campaignId,
      rawStream as AsyncIterable<StreamEvent>,
      (campaignId, chunk) => broadcastToAll(campaignId, { type: "chunk", content: chunk }),
      (campaignId, chunkLength) => logInfo("game_session.openai_stream_chunk", { campaignId, chunkLength }),
    )

    logInfo("game_session.openai_stream_complete", {
      campaignId,
      narrationLength: fullText.length,
      durationMs: Date.now() - startedAt,
    })

    const narrationContent = fullText.trim()
    if (!narrationContent) throw new Error("Empty narration returned")

    const { error: narrationInsertError } = await supabase
      .from("messages")
      .insert([{
        campaign_id: campaignId,
        player_id: null,
        content: narrationContent,
        type: "narration" as const,
        client_id: null,
        processed: true,  // narration is never a "pending action"
      }])

    if (narrationInsertError) throw narrationInsertError

    logInfo("game_session.db_save_complete", { campaignId })
    logInfo("game_session.round_complete", { campaignId, durationMs: Date.now() - startedAt })

    // Signal this isolate's connected players that streaming is done.
    // Other players receive the narration via Realtime postgres_changes.
    broadcastToAll(campaignId, { type: "round:saved" })
  } catch (err) {
    logError("game_session.openai_call_failed", { campaignId }, err)
    broadcastToAll(campaignId, { type: "error", message: "Failed to generate narration" })
  } finally {
    // Release the round lock only if we acquired it
    if (lockAcquired) {
      await supabase
        .from("campaigns")
        .update({ round_in_progress: false })
        .eq("id", campaignId)
    }

    const session = sessions.get(campaignId)
    if (session) {
      session.isProcessing = false  // ALWAYS reset, regardless of exit path

      // Check for actions that arrived while we were processing
      if (lockAcquired) {
        const { data: remaining } = await supabase
          .from("messages")
          .select("id")
          .eq("campaign_id", campaignId)
          .eq("type", "action")
          .eq("processed", false)
          .limit(1)

        if (remaining?.length) {
          resetDebounce(campaignId, () => fireDebounce(campaignId))
        }
      }
    }
  }
}

// ─── Debounce fire ────────────────────────────────────────────────────────────

async function fireDebounce(campaignId: string): Promise<void> {
  const session = sessions.get(campaignId)
  if (!session) return
  if (session.isProcessing) return

  logInfo("game_session.debounce_fired", { campaignId })
  session.isProcessing = true
  await runRound(campaignId)
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const campaignId = url.searchParams.get("campaignId")

  // Browser WebSocket API cannot set custom headers; JWT is passed as a
  // Sec-WebSocket-Protocol entry ("jwt-<token>") from the client.
  const { protocol, token } = extractJwtFromProtocolHeader(req.headers.get("sec-websocket-protocol"))

  if (!campaignId || !token || !protocol) {
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

  const { socket, response } = Deno.upgradeWebSocket(req, { protocol })

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
      // Otherwise: client receives messages via Supabase Realtime postgres_changes
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

    const saveAndSchedule = async () => {
      // Bug 2 fix: insert into messages immediately so Realtime delivers it to ALL clients
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          campaign_id: campaignId,
          player_id: playerId,
          content: msg.content,
          type: "action" as const,
          client_id: msg.id,
          processed: false,
        })

      if (msgError) {
        // Duplicate client_id (e.g. reconnect replay) — skip silently
        logInfo("game_session.action_skip", { campaignId, reason: msgError.message })
        return
      }

      const session = getOrCreateSession(campaignId)
      if (!session.isProcessing) {
        resetDebounce(campaignId, () => fireDebounce(campaignId))
      }
      // If isProcessing: the finally block in runRound will re-check for remaining
      // unprocessed actions and schedule a follow-up round if needed.
    }

    saveAndSchedule().catch((err) =>
      logError("game_session.save_action_error", { campaignId }, err)
    )
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
