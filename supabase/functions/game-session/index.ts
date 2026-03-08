import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import OpenAI from "npm:openai"
import {
  sessions,
  getOrCreateSession,
  registerConnection,
  removeConnection,
  broadcastToAll,
  type PendingMessage,
} from "./state.ts"
import { resetDebounce } from "./debounce.ts"
import { buildGMSystemPrompt, buildFirstCallInput, isFirstCallResponse } from "./prompt.ts"
import { extractNarration } from "./openai.ts"
import { extractJwtFromProtocolHeader } from "./ws-auth.ts"
import { buildRoundMessages } from "./round-messages.ts"

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
      fullText = event.response.output_text
      newResponseId = event.response.id
    }
  }

  return { fullText, newResponseId }
}

// ─── First Call ───────────────────────────────────────────────────────────────

async function runFirstCall(campaignId: string): Promise<void> {
  const startedAt = Date.now()

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
    return
  }

  if (!campaign || campaign.last_response_id !== "pending") {
    logInfo("game_session.first_call_skipped", { campaignId, reason: "race_lost" })
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

    const narration = extractNarration(parsed)
    if (!narration.length) {
      throw new Error("OpenAI first-call response has no narration")
    }

    logInfo("game_session.db_save_started", { campaignId, messageCount: narration.length })

    const { data: savedMessages, error: insertError } = await supabase
      .from("messages")
      .insert(narration.map((content) => ({
        campaign_id: campaignId,
        player_id: null,
        content,
        type: "narration" as const,
      })))
      .select("*")

    if (insertError) throw insertError

    await supabase
      .from("campaigns")
      .update({ last_response_id: newResponseId })
      .eq("id", campaignId)

    logInfo("game_session.db_save_complete", { campaignId, newResponseId })
    logInfo("game_session.round_complete", { campaignId, durationMs: Date.now() - startedAt })

    broadcastToAll(campaignId, {
      type: "round:saved",
      messages: (savedMessages as DbMessage[]).map((m) => ({ clientId: null, dbMessage: m })),
    })
  } catch (err) {
    logError("game_session.openai_call_failed", { campaignId }, err)
    // Reset so the next connection can retry rather than hanging on 'pending' forever.
    await clearPendingFirstCall(campaignId)
    broadcastToAll(campaignId, { type: "error", message: "Failed to generate opening narration" })
  }
}

// ─── Round ────────────────────────────────────────────────────────────────────

async function runRound(campaignId: string, pending: PendingMessage[]): Promise<void> {
  const startedAt = Date.now()

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("last_response_id")
    .eq("id", campaignId)
    .single()

  const lastResponseId = campaign?.last_response_id ?? null

  logInfo("game_session.openai_call_started", { campaignId, previousResponseId: lastResponseId })

  const input = JSON.stringify(
    pending.map((m) => ({ clientId: m.clientId, playerName: m.playerName, content: m.content }))
  )

  try {
    const rawStream = await openai.responses.create({
      model: "gpt-4o",
      previous_response_id: lastResponseId,
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

    const r = parsed as { actions?: Array<{ clientId: string; playerName: string; content: string }>; narration?: string[] }
    const actions = Array.isArray(r.actions) ? r.actions : []
    const narration = extractNarration(parsed)

    const clientIdToPlayerId = new Map(pending.map((m) => [m.clientId, m.playerId]))

    const messageRows: Array<{ campaign_id: string; player_id: string | null; content: string; type: 'action' | 'narration' }> = [
      ...actions.map((a) => ({
        campaign_id: campaignId,
        player_id: clientIdToPlayerId.get(a.clientId) ?? null,
        content: a.content,
        type: "action" as const,
      })),
      ...narration.map((para) => ({
        campaign_id: campaignId,
        player_id: null,
        content: para,
        type: "narration" as const,
      })),
    ]

    logInfo("game_session.db_save_started", { campaignId, messageCount: messageRows.length })

    const { data: savedMessages, error: insertError } = await supabase
      .from("messages")
      .insert(messageRows)
      .select("*")

    if (insertError) throw insertError

    await supabase
      .from("campaigns")
      .update({ last_response_id: newResponseId })
      .eq("id", campaignId)

    logInfo("game_session.db_save_complete", { campaignId, newResponseId })
    logInfo("game_session.round_complete", { campaignId, durationMs: Date.now() - startedAt })

    const roundMessages = buildRoundMessages({
      actions,
      savedMessages: savedMessages as DbMessage[],
      clientIdToPlayerId,
    })

    broadcastToAll(campaignId, { type: "round:saved", messages: roundMessages })
  } catch (err) {
    logError("game_session.openai_call_failed", { campaignId }, err)
    broadcastToAll(campaignId, { type: "error", message: "Failed to generate narration" })
  } finally {
    const session = sessions.get(campaignId)
    if (session) {
      session.isProcessing = false
      if (session.nextRoundMessages.length > 0) {
        const next = session.nextRoundMessages.splice(0)
        session.pendingMessages = next
        resetDebounce(campaignId, () => fireDebounce(campaignId))
      }
    }
  }
}

// ─── Debounce fire ────────────────────────────────────────────────────────────

async function fireDebounce(campaignId: string): Promise<void> {
  const session = sessions.get(campaignId)
  if (!session || session.pendingMessages.length === 0) return

  logInfo("game_session.debounce_fired", { campaignId, pendingMessageCount: session.pendingMessages.length })

  const pending = session.pendingMessages.splice(0)
  session.isProcessing = true

  await runRound(campaignId, pending)
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const campaignId = url.searchParams.get("campaignId")

  // Browser WebSocket API cannot set custom headers; token is passed via
  // Sec-WebSocket-Protocol as "jwt-<token>" (Supabase recommended approach).
  const { protocol: jwtProtocol, token } = extractJwtFromProtocolHeader(
    req.headers.get("Sec-WebSocket-Protocol"),
  )

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

  const { socket, response } = Deno.upgradeWebSocket(req, { protocol: jwtProtocol ?? undefined })

  socket.onopen = async () => {
    logInfo("game_session.connection_opened", { campaignId, playerId, playerName })
    registerConnection(campaignId, playerId, socket)

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("last_response_id")
      .eq("id", campaignId)
      .single()

    if (campaign?.last_response_id === null) {
      await runFirstCall(campaignId)
    }
    // If 'pending': another player connected — wait for round:saved broadcast
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

    const session = getOrCreateSession(campaignId)
    const pending: PendingMessage = {
      clientId: msg.id,
      playerId,
      playerName,
      content: msg.content,
      clientTimestamp: msg.timestamp ?? Date.now(),
    }

    if (session.isProcessing) {
      session.nextRoundMessages.push(pending)
    } else {
      session.pendingMessages.push(pending)
      resetDebounce(campaignId, () => fireDebounce(campaignId))
    }

    broadcastToAll(campaignId, {
      type: "player:action",
      id: msg.id,
      playerId,
      playerName,
      content: msg.content,
      timestamp: msg.timestamp ?? Date.now(),
    }, playerId)
  }

  socket.onclose = (event) => {
    logInfo("game_session.connection_closed", { campaignId, playerId, reason: event.reason || "normal" })
    removeConnection(campaignId, playerId, socket)
  }

  socket.onerror = (event) => {
    logError("game_session.connection_error", { campaignId, playerId }, event)
  }

  return response
})
