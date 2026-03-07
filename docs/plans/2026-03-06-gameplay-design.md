# Gameplay Design: Real-Time AI Game Session

**Date:** 2026-03-06
**Status:** Partially implemented — see implementation notes inline
**Branch:** `feature/gameplay`

---

## Overview

This document describes the design for the live game session — the core gameplay loop where players interact with an AI Game Master in real time. It covers the full arc from campaign start through ongoing play.

The design is built around three goals:

1. **Single persistent AI conversation.** The entire game is one continuous dialogue with OpenAI. Player actions accumulate and are sent in batches. The AI's response always continues from where the last one left off, with no history resent.

2. **Optimistic UX.** Player messages appear in the chat immediately. They are only persisted to the database once OpenAI has acknowledged and narrated the round. This guarantees the DB reflects only content the GM has actually responded to.

3. **Server-side coordination.** A Supabase Edge Function (Deno WebSocket server) acts as the single coordinator for all players in a campaign. All messages flow through it. It owns the debounce timer, the OpenAI call, and the atomic DB write.

---

## System Architecture

```
Browser (each player)
  │
  │  WebSocket
  ▼
supabase/functions/game-session  (Deno, long-lived WebSocket server)
  │
  ├── In-memory per-campaign state
  │     - connected sockets
  │     - pending player messages (not yet sent to AI)
  │     - shared debounce timer
  │
  ├── OpenAI Responses API  (gpt-4o, previous_response_id chain)
  │
  └── Supabase DB  (messages table, campaigns.last_response_id)
```

### AI Providers

| Role | Provider | When |
|------|----------|------|
| World generation | Claude (existing, `generate-world`) | Campaign creation |
| Image generation | Gemini (existing, `generate-image`) | On demand |
| Live game narration — first call + all rounds | OpenAI gpt-4o (Responses API, `game-session`) | Game start + every round |

> **Note:** `start-campaign` edge function was deleted. The opening narration and all AI calls are now handled entirely by `game-session` on first WebSocket connection.

---

## Database Changes

### `campaigns` table

```sql
ALTER TABLE campaigns
  ADD COLUMN last_response_id TEXT;

-- opening_situation and starting_hooks columns were dropped:
-- these fields now live in the game-session AI chain (first-call response), not in the DB
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS opening_situation,
  DROP COLUMN IF EXISTS starting_hooks;
```

`last_response_id` stores the OpenAI `response.id` from the most recently completed GM narration. It is:

- `NULL` until `game-session` completes the first OpenAI call (opening narration)
- Set to `'pending'` while the first narration is being generated (prevents duplicate starts)
- Set to the real OpenAI `response.id` once the first narration is complete
- Updated after every subsequent GM narration round

`last_response_id IS NOT NULL AND last_response_id != 'pending'` is the signal that the game is fully ready for players.

### `messages` table

No schema changes. Existing columns are sufficient:

```
id            uuid (DB-generated)
campaign_id   uuid
player_id     uuid | null  (null for GM narration)
content       text
type          'action' | 'narration' | 'system' | 'ooc'
created_at    timestamptz
```

---

## GM System Prompt

The system prompt is built once per campaign by `buildGMSystemPrompt()` in `supabase/functions/game-session/prompt.ts` and sent as the `instructions` parameter on the first OpenAI Responses API call from `game-session`. It is not resent on subsequent calls — OpenAI retains it as part of the conversation state.

The actual prompt (as implemented):

```
<role>
You are the Game Master for a tabletop RPG campaign. Narrate the story in second person,
immersive prose. React to all player actions collectively. Detect the language used in
the world description and write all narration entirely in that language.
</role>

<world>
{world.world_content}
</world>

<player-characters>
{players formatted as: "- Name (Class): Backstory"}
</player-characters>

<narration-rules>
- Address all player actions in each narration. No player is ignored.
- Keep narrations between 3-6 paragraphs. Vivid but not exhausting.
- End each narration with a clear situation: what the players see, hear, or face next.
- If a player's action is impossible or fails, narrate the failure dramatically.
- Never break character. Never acknowledge you are an AI.

Player placement: Players may begin together, in small groups, or alone — honor the
opening situation exactly. When players are split, narrate each group's location and
immediate reality. Bring them together only when the story earns it.

Opening narration: The first narration must establish the world vividly — atmosphere,
place, what is at stake — and make each player's position and situation immediately clear.
Do not waste the opening on generic scene-setting.

Story hooks: The starting hooks are the spine of this campaign. Reference them, develop
them, escalate them. Every 2-3 narrations, at least one hook should be visibly in motion —
named, felt, or pressing closer.

World texture: Weave world-specific details (locations, factions, creatures, history) into
every narration. The world should feel alive and specific, not generic.

Pacing: This campaign is meant to be short and intense. Drive toward meaningful moments —
confrontations, revelations, decisions. Avoid filler. If the players stall, a hook tightens.
</narration-rules>

<mechanics-rules>
- HP is tracked on a 0-20 scale.
- D20 rolls determine success on contested or risky actions.
- Describe dice outcomes narratively — never expose raw numbers.
</mechanics-rules>

<output-format>
Every response must be a JSON object. No markdown fences, no text outside the JSON.

First response schema:
{
  "world_context": { "history": "string", "factions": "string", "tone": "string" },
  "opening_situation": "string",
  "starting_hooks": ["string", "string", "string"],
  "actions": [],
  "narration": ["string"]
}

All subsequent responses:
{
  "actions": [{ "clientId": "string", "playerName": "string", "content": "string" }],
  "narration": ["string"]
}
</output-format>
```

The first call input (from `buildFirstCallInput()`):

```
Generate this world's History, Factions, and Tone. Then establish the opening situation
and starting hooks for this campaign. Then narrate the opening scene.
Respond using the first response schema.
```

The `world_context`, `opening_situation`, and `starting_hooks` from the first call are **not persisted to the DB** — they live only in the OpenAI conversation chain and inform subsequent narrations.

---

## Flow 1: Start Campaign

> **Implementation note:** `start-campaign` edge function has been **deleted**. All OpenAI calls moved to `game-session`. The start route is simplified.

### Next.js Route (`app/api/campaign/[id]/start/route.ts`) — as implemented

```
1. Validate host is authenticated
2. Fetch campaign (must exist, status must be 'lobby')
3. Validate all players are ready
4. Set campaigns.status = 'active' (optimistic — atomic with status check)
5. Broadcast game:starting
6. Fire-and-forget: POST to generate-image (campaign cover)
7. Return 200
```

The first OpenAI call (opening narration) is **not triggered here**. It happens in `game-session` on the first client WebSocket connection.

### First OpenAI Call — in `game-session` on first connection

When the first player connects after `status = 'active'` and `last_response_id` is `NULL`:

```
1. Set campaigns.last_response_id = 'pending'  (prevents duplicate first calls)
2. Build GM system prompt from world content + players  (buildGMSystemPrompt)
3. Call OpenAI Responses API — first call (no previous_response_id):
     instructions: GM system prompt
     input: buildFirstCallInput()
     stream: true
4. Stream narration tokens → broadcast chunks to connected clients
5. Parse first-call response: { world_context, opening_situation, starting_hooks, actions, narration }
   — world_context/opening_situation/starting_hooks live in the AI chain, not persisted to DB
6. Save opening narration paragraphs → messages table (type: 'narration', player_id: null)
7. Update campaigns.last_response_id = response.id
8. Broadcast round:saved with DB-confirmed narration messages
```

If step 3–7 fails, `last_response_id` stays `'pending'`. On reconnect, `game-session` should detect the pending state and retry the first call (implementation TBD).

---

## Flow 2: Game Room Entry

### Client Connection

On game room load, the client:

1. Reads `campaign.last_response_id` from the page props (server-rendered)
2. If `null` or `'pending'`:
   - Renders loading screen
   - Opens WebSocket to `game-session` immediately — the edge function handles the first call
   - (The loading screen clears once `round:saved` arrives with the opening narration)
3. If a real response ID is set (game already in progress / page refresh):
   - Loads full message history from DB (existing messages)
   - Opens WebSocket to `game-session` edge function
   - Renders game room UI, ready to play

> **Implementation note:** `GameClient.tsx` currently uses `openingReady` state was removed — the game always starts via the `game:started` event / WebSocket flow. The `loading` view state is shown until the first narration arrives.

### WebSocket Connection URL

```
wss://[project].supabase.co/functions/v1/game-session?campaignId={id}
```

The Supabase auth token is sent as a query parameter (WebSocket connections cannot set custom headers in browsers):

```
wss://[project].supabase.co/functions/v1/game-session?campaignId={id}&token={supabase_access_token}
```

### Deployment Requirement

The function must be deployed with `--no-verify-jwt` to bypass Supabase's default header-based JWT verification — WebSocket upgrade requests have no `Authorization` header, so the default behavior would reject every connection before the function code runs:

```bash
supabase functions deploy game-session --no-verify-jwt
```

JWT verification is handled manually inside the function (see below).

### Server-Side Authentication

On each WebSocket upgrade request, the `game-session` function:

1. Extracts `campaignId` and `token` from query parameters
2. Verifies the JWT using `supabase.auth.getClaims(token)` — rejects with 401 if invalid or expired
3. Queries `players` table: `SELECT id, character_name, username FROM players WHERE campaign_id = ? AND user_id = ?`
4. Rejects with 403 if no player record found — only campaign participants can connect
5. If valid, upgrades the connection and registers the socket

---

## Flow 3: Game Loop

### Constants

```typescript
const DEBOUNCE_SECONDS = 8  // Time to wait after last player message before calling AI
```

Defined at the top of `game-session/index.ts` for easy tuning during testing.

### In-Memory Campaign State

The edge function maintains state per campaign in a `Map`. This state lives in the Deno process memory for the duration of the WebSocket connections.

```typescript
interface PendingMessage {
  clientId: string       // client-generated UUID — used for optimistic UI matching
  playerId: string       // DB player ID
  playerName: string     // character_name ?? username
  content: string
  clientTimestamp: number
}

interface CampaignSession {
  connections: Map<string, WebSocket>   // playerId → socket
  pendingMessages: PendingMessage[]
  debounceTimer: ReturnType<typeof setTimeout> | null
}

const sessions = new Map<string, CampaignSession>()
```

### Message Flow (Step by Step)

```
1. Player types a message and hits send
2. Client generates: id = crypto.randomUUID(), timestamp = Date.now()
3. Client sends via WebSocket:
   { type: 'action', id: '...', content: 'I draw my sword', timestamp: 1234567890 }
4. Client immediately adds message to local chat (optimistic display) using the client-generated id

5. Server receives the action
6. Server logs: [campaign:{id}] action received from player {playerName}
7. Server adds message to pendingMessages[]
8. Server broadcasts the action to ALL other connected players:
   { type: 'player:action', id: '...', playerId: '...', playerName: '...', content: '...', timestamp: ... }
   — so all players see each other's messages in real-time
9. Server clears existing debounce timer (if any) and sets a new one for DEBOUNCE_SECONDS

--- DEBOUNCE_SECONDS of silence from all players ---

10. Server logs: [campaign:{id}] debounce fired, bundling {n} pending messages
11. Server clears pendingMessages (snapshots them for processing)
12. Server fetches campaigns.last_response_id from DB

13. Server logs: [campaign:{id}] calling OpenAI (previous_response_id: {id})
14. Server formats bundled input as a JSON array:
    [
      { "clientId": "...", "playerName": "Aragorn", "content": "I draw my sword and charge" },
      { "clientId": "...", "playerName": "Gandalf", "content": "I cast a protective shield" },
      { "clientId": "...", "playerName": "Legolas", "content": "I fire two arrows" }
    ]

15. Server calls OpenAI Responses API:
    {
      previous_response_id: lastResponseId,
      input: JSON.stringify(pendingMessages),
      response_format: { type: 'json_schema', json_schema: roundResponseSchema },
      stream: true
    }

16. As tokens stream in, server accumulates the full JSON response.
    Simultaneously, server extracts narration tokens as they appear in the stream
    and broadcasts each to ALL connected clients:
    { type: 'chunk', content: '...token...' }
    (Server detects the start of the "narration" field in the streaming JSON and
    forwards delta content from that point; stops at the closing bracket.)

17. Stream completes. Server parses the complete JSON response:
    {
      actions: [{ clientId, playerName, content }, ...],
      narration: ["paragraph 1", "paragraph 2", ...]
    }
18. Server logs: [campaign:{id}] stream complete, saving {n} messages to DB

19. Server saves atomically to DB (single transaction):
    a. For each action in response.actions: INSERT as type='action', player_id=playerId
       (player_id resolved by matching clientId → playerId from pendingMessages)
    b. For each narration paragraph: INSERT as type='narration', player_id=null

20. Server updates campaigns.last_response_id = newResponse.id

21. Server logs: [campaign:{id}] round complete, new response_id: {id}

22. Server broadcasts round completion to ALL clients:
    {
      type: 'round:saved',
      messages: [
        { clientId: '...', dbMessage: { id: '...', content: '...', type: 'action', ... } },
        { clientId: '...', dbMessage: { id: '...', content: '...', type: 'action', ... } },
        { clientId: null,  dbMessage: { id: '...', content: '...', type: 'narration', ... } },
        { clientId: null,  dbMessage: { id: '...', content: '...', type: 'narration', ... } }
      ]
    }

23. Each client:
    a. Receives round:saved
    b. Matches each clientId to its optimistic message in local state
    c. Replaces optimistic message with the DB-confirmed version (real UUID, real created_at)
    d. Replaces streaming narration with the confirmed DB narration messages
```

### Debounce Timer Semantics

- There is **one timer per campaign**, shared across all connected players
- Any `action` message from any player resets the timer to `DEBOUNCE_SECONDS`
- If a player disconnects while messages are pending, the timer continues — their messages are still in `pendingMessages` and will be sent on the next fire
- The timer is cleared when it fires and not restarted until the next player action (after the round completes)
- While OpenAI is streaming (between debounce fire and `round:saved`), incoming player actions are queued into a new `pendingMessages[]` for the next round — they do not interrupt the current narration

---

## WebSocket Message Protocol

All messages are JSON strings.

### Client → Server

```typescript
// Player sends an action or dialogue
{
  type: 'action'
  id: string          // crypto.randomUUID() — client generated
  content: string     // the player's message
  timestamp: number   // Date.now()
}
```

### Server → Client

```typescript
// Another player's action (broadcast to all other players in real-time)
{
  type: 'player:action'
  id: string
  playerId: string
  playerName: string
  content: string
  timestamp: number
}

// Token chunk during GM narration (streaming)
{
  type: 'chunk'
  content: string
}

// Round complete — contains DB-confirmed versions of all messages
{
  type: 'round:saved'
  messages: Array<{
    clientId: string | null   // null for GM narration
    dbMessage: {
      id: string
      campaign_id: string
      player_id: string | null
      content: string
      type: 'action' | 'narration'
      created_at: string
    }
  }>
}

// Server error during narration
{
  type: 'error'
  message: string
}
```

---

## OpenAI Responses API Integration

### First Call (in `game-session` edge function — on first WebSocket connection)

```typescript
const response = await openai.responses.create({
  model: 'gpt-4o',
  instructions: buildGMSystemPrompt(worldContent, players),   // only sent once
  input: buildFirstCallInput(),
  stream: true
})
// parse response JSON → { world_context, opening_situation, starting_hooks, actions, narration }
// save narration paragraphs → messages
// save response.id → campaigns.last_response_id
```

The `FirstCallResponse` type (from `game-session/prompt.ts`):

```typescript
interface FirstCallResponse {
  world_context: { history: string; factions: string; tone: string }
  opening_situation: string
  starting_hooks: string[]
  actions: []
  narration: string[]
}
```

`world_context`, `opening_situation`, and `starting_hooks` are **not stored in the DB** — they inform subsequent narrations through the OpenAI conversation chain (`previous_response_id`).

### Subsequent Calls (in `game-session` edge function)

```typescript
interface RoundResponse {
  actions: Array<{ clientId: string; playerName: string; content: string }>
  narration: string[]
}

const input = JSON.stringify(
  pendingMessages.map(m => ({ clientId: m.clientId, playerName: m.playerName, content: m.content }))
)

const response = await openai.responses.create({
  model: 'gpt-4o',
  previous_response_id: campaign.last_response_id,
  input,
  response_format: { type: 'json_schema', json_schema: roundResponseSchema },
  stream: true,
})
// parse response JSON → { actions, narration }
// update campaigns.last_response_id = response.id
```

The `instructions` field is omitted on subsequent calls. OpenAI retains the system prompt as part of the conversation state identified by `previous_response_id`.

### Streaming

OpenAI streaming returns an async iterable of events. The relevant events:

```typescript
for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    broadcastToAll({ type: 'chunk', content: event.delta })
  }
  if (event.type === 'response.completed') {
    fullNarration = event.response.output_text
    newResponseId = event.response.id
  }
}
```

---

## Logging

The `game-session` function uses the same `logInfo` / `logError` pattern as existing edge functions, with a consistent prefix of `game_session.*`.

Key log events:

| Event | Level | Context |
|-------|-------|---------|
| `game_session.connection_opened` | info | campaignId, playerId, playerName |
| `game_session.connection_closed` | info | campaignId, playerId, reason |
| `game_session.auth_failed` | info | reason (no token / invalid JWT / no player record) |
| `game_session.action_received` | info | campaignId, playerId, messageLength |
| `game_session.debounce_fired` | info | campaignId, pendingMessageCount |
| `game_session.openai_call_started` | info | campaignId, previousResponseId |
| `game_session.openai_stream_chunk` | info | campaignId, chunkLength (sampled — not every chunk) |
| `game_session.openai_stream_complete` | info | campaignId, narrationLength, durationMs |
| `game_session.db_save_started` | info | campaignId, messageCount |
| `game_session.db_save_complete` | info | campaignId, newResponseId |
| `game_session.round_complete` | info | campaignId, durationMs (from debounce fire to round:saved) |
| `game_session.openai_call_failed` | error | campaignId, error |
| `game_session.db_save_failed` | error | campaignId, error |

---

## Client-Side State Management

The `GameClient.tsx` component manages two layers of message state:

```typescript
// Confirmed messages — loaded from DB on mount, extended by round:saved events
const [messages, setMessages] = useState<Message[]>(initialMessages)

// Optimistic messages — added immediately on send, removed when round:saved arrives
const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([])

// Streaming narration in progress
const [streamingContent, setStreamingContent] = useState<string>('')
const [isStreaming, setIsStreaming] = useState(false)
```

The displayed message list is the union of `messages` + `optimisticMessages`, sorted by timestamp. When `round:saved` arrives:

1. Remove all matching `optimisticMessages` by `clientId`
2. Append the DB-confirmed messages to `messages`
3. Clear `streamingContent`, set `isStreaming = false`

---

## Security Considerations

**Authentication:** Every WebSocket connection is authenticated by JWT. The edge function verifies the token and checks for a valid player record in the campaign before allowing the upgrade. There is no way to connect to a campaign you are not a player in.

**Prompt injection defense:** Player-submitted content (the `content` field of `action` messages) is formatted as plain text in the `input` field of OpenAI API calls — never injected into the `instructions` (system prompt). World content, character data, and opening situation are injected into the system prompt at start time from server-controlled DB fields only.

**Rate limiting:** The debounce timer naturally throttles OpenAI calls to at most one per `DEBOUNCE_SECONDS` window. No additional rate limiting is implemented at this stage.

---

## Known Limitations

**WebSocket connection timeout.** Supabase Edge Functions running on Deno have a wall-clock execution limit (approximately 150s on free tier, 400s on pro). A WebSocket connection held open beyond this limit will be killed. A game session running longer than this limit will drop all connections. This is a known limitation accepted for this version. Mitigation strategies (reconnection with state recovery, migrating to a dedicated server) are deferred to a future iteration.

**Single Deno instance state.** In-memory campaign state (debounce timer, pending messages) lives in one Deno process instance. If Supabase scales the edge function horizontally, two instances could have split state. For the expected usage (small group, single campaign at a time), this is not a practical concern.

---

## Files to Create or Modify

| File | Change | Status |
|------|--------|--------|
| `supabase/migrations/YYYYMMDD_add_last_response_id.sql` | **New** — add `last_response_id`, drop `opening_situation`/`starting_hooks` | TODO |
| `types/campaign.ts` | **Modify** — add `last_response_id: string \| null`, remove `opening_situation`/`starting_hooks` | Done |
| `app/api/campaign/[id]/start/route.ts` | **Modify** — set `status = 'active'`, broadcast `game:starting`, fire cover image | Done |
| `supabase/functions/start-campaign/index.ts` | **Deleted** — responsibilities split: cover image → start route, OpenAI → game-session | Done |
| `supabase/functions/generate-image/index.ts` | **Modify** — cover image uses character backstories, prompt extracted to `prompt.ts` | Done |
| `supabase/functions/generate-image/prompt.ts` | **New** — image prompt builders + campaign prompt builder | Done |
| `supabase/functions/generate-world/index.ts` | **Modify** — removed History/Factions/Tone from required sections | Done |
| `supabase/functions/generate-world/prompt.ts` | **New** — system prompt extracted | Done |
| `supabase/functions/game-session/prompt.ts` | **New** — `buildGMSystemPrompt`, `buildFirstCallInput`, `FirstCallResponse`/`RoundResponse` types | Done |
| `supabase/functions/game-session/openai.ts` | **New** — `extractNarration` helper (full OpenAI call logic TBD in index.ts) | Partial |
| `supabase/functions/game-session/index.ts` | **New** — Deno WebSocket server (main handler, first-call logic, game loop) | TODO |
| `supabase/functions/game-session/state.ts` | **New** — in-memory CampaignSession map, connection management | TODO |
| `supabase/functions/game-session/debounce.ts` | **New** — debounce timer logic | TODO |
| `app/campaign/[slug]/game/GameClient.tsx` | **Modify** — removed `openingReady`, fixed permanent loading on refresh | Done |
| `app/campaign/[slug]/game/page.tsx` | **Modify** — pass `last_response_id` to client, handle loading state | Done |

---

## Testing Strategy

| What | How | Status |
|------|-----|--------|
| `game-session/prompt` — `buildGMSystemPrompt` includes world + players + all rule sections | Unit test | Done |
| `game-session/prompt` — `buildFirstCallInput` returns correct instruction string | Unit test | Done |
| `game-session/prompt` — `isFirstCallResponse` correctly identifies first-call vs round response | Unit test | Done |
| `game-session/openai` — `extractNarration` returns narration array from valid response | Unit test | Done |
| `game-session` — rejects connection with invalid JWT | Unit test | TODO |
| `game-session` — rejects connection for non-player user | Unit test | TODO |
| `game-session` — first call triggered when `last_response_id` is null | Unit test | TODO |
| `game-session` — sets `last_response_id = 'pending'` before first OpenAI call | Unit test | TODO |
| `game-session` — saves opening narration paragraphs to messages after first call | Unit test | TODO |
| `game-session` — debounce fires after DEBOUNCE_SECONDS of silence | Unit test (fake timers) | TODO |
| `game-session` — debounce resets on new message | Unit test (fake timers) | TODO |
| `game-session` — bundles all pending messages into one OpenAI call | Unit test (mock openai) | TODO |
| `game-session` — broadcasts chunks to all connected clients | Unit test (mock WebSocket) | TODO |
| `game-session` — saves messages atomically on round complete | Unit test | TODO |
| `game-session` — updates `last_response_id` after each round | Unit test | TODO |
| `game-session` — broadcasts `round:saved` with correct clientId mapping | Unit test | TODO |
| Client optimistic message display | Visual/manual | TODO |
| Client message replacement on `round:saved` | Visual/manual | TODO |
| Client streaming narration display | Visual/manual | TODO |
| End-to-end: 2 players, 1 round, full flow | Manual (local Supabase) | TODO |
