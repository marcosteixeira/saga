# Gameplay Design: Real-Time AI Game Session

**Date:** 2026-03-06
**Status:** Approved
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
| World/campaign generation | Claude (existing) | Before game starts |
| Live game narration | OpenAI gpt-4o (Responses API) | Every round |
| Image generation | Gemini (existing) | On demand |

---

## Database Changes

### `campaigns` table

```sql
ALTER TABLE campaigns
  ADD COLUMN last_response_id TEXT;
```

`last_response_id` stores the OpenAI `response.id` from the most recently completed GM narration. It is:

- `NULL` until the campaign's opening narration has been generated and saved
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

The system prompt is built once per campaign at game start and sent as the `instructions` parameter on the first OpenAI Responses API call. It is not resent on subsequent calls — OpenAI retains it as part of the conversation state.

The prompt includes:

```
<role>
You are the Game Master for a tabletop RPG campaign. Narrate the story in second person,
immersive prose. React to all player actions collectively. Write in the language
of the world description.
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
</narration-rules>

<mechanics-rules>
- HP is tracked on a 0-20 scale.
- D20 rolls determine success on contested or risky actions.
- Describe dice outcomes narratively — never expose raw numbers.
</mechanics-rules>
```

This prompt is constructed in the `start-campaign` edge function and passed to OpenAI's `instructions` field.

---

## Flow 1: Start Campaign

The existing `start-campaign` edge function is extended. The Next.js route (`POST /api/campaign/[id]/start`) is also modified.

### Next.js Route Changes (`app/api/campaign/[id]/start/route.ts`)

**Current behavior:**
1. Validate host + all players ready
2. Set `campaigns.status = 'active'`
3. Broadcast `game:starting`
4. Fire edge function async (fire-and-forget)
5. Return 200

**New behavior:**
1. Validate host + all players ready
2. Broadcast `game:starting` (clients redirect to game room immediately)
3. Fire edge function async (fire-and-forget) — **do not set status here**
4. Return 200

The status transition to `'active'` is moved to the edge function as the final step, ensuring `active` only means "game is fully ready to play."

### Edge Function Changes (`supabase/functions/start-campaign/index.ts`)

Extended with steps 6–10 appended after the existing Claude generation:

```
1. [EXISTING] Fetch world content + players
2. [EXISTING] Idempotency check
3. [EXISTING] Call Claude → generate opening_situation + starting_hooks
4. [EXISTING] Save opening_situation + starting_hooks to campaigns
5. [EXISTING] Fire image generation (fire-and-forget via EdgeRuntime.waitUntil)

6. [NEW] Build GM system prompt from world content + players
7. [NEW] Set campaigns.last_response_id = 'pending'  (prevents duplicate starts)
8. [NEW] Call OpenAI Responses API (first call — no previous_response_id):
         instructions: GM system prompt
         input: opening_situation + "The adventure begins."
         stream: true
9. [NEW] Stream opening narration tokens → broadcast via WebSocket to any connected clients
         (clients connecting early will see it stream in)
10. [NEW] Save opening narration → messages table (type: 'narration', player_id: null)
11. [NEW] Update campaigns.last_response_id = response.id
12. [NEW] Set campaigns.status = 'active'  ← LAST step
13. [NEW] Broadcast game:ready on campaign:{id} channel
```

If step 8–12 fails, `last_response_id` stays `'pending'` and `status` stays `'lobby'`. The host can retry by hitting "Start Game" again. The idempotency check in step 2 prevents duplicate Claude calls.

---

## Flow 2: Game Room Entry

### Client Connection

On game room load, the client:

1. Reads `campaign.last_response_id` from the page props (server-rendered)
2. If `null` or `'pending'`:
   - Renders loading screen
   - Subscribes to Supabase Realtime channel `campaign:{id}` for `game:ready`
   - On `game:ready` received → reload page data → proceed to step 3
3. If a real response ID is set:
   - Loads full message history from DB (existing messages)
   - Opens WebSocket to `game-session` edge function
   - Renders game room UI, ready to play

### WebSocket Connection URL

```
wss://[project].supabase.co/functions/v1/game-session?campaignId={id}
```

The Supabase auth token is sent as a query parameter (WebSocket connections cannot set custom headers in browsers):

```
wss://[project].supabase.co/functions/v1/game-session?campaignId={id}&token={supabase_access_token}
```

### Server-Side Authentication

On each WebSocket upgrade request, the `game-session` function:

1. Extracts `campaignId` and `token` from query parameters
2. Verifies the JWT using Supabase's auth — rejects with 401 if invalid or expired
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
14. Server formats bundled input:
    "Aragorn: I draw my sword and charge\nGandalf: I cast a protective shield\nLegolas: I fire two arrows"

15. Server calls OpenAI Responses API:
    { previous_response_id: lastResponseId, input: bundledInput, stream: true }

16. As tokens stream in, server broadcasts to ALL connected clients:
    { type: 'chunk', content: '...token...' }

17. Stream completes
18. Server logs: [campaign:{id}] stream complete, saving {n} messages to DB

19. Server saves atomically to DB (single transaction):
    a. INSERT each pending player message as type='action', player_id=playerId
    b. INSERT GM narration as type='narration', player_id=null

20. Server updates campaigns.last_response_id = newResponse.id

21. Server logs: [campaign:{id}] round complete, new response_id: {id}

22. Server broadcasts round completion to ALL clients:
    {
      type: 'round:saved',
      messages: [
        { clientId: '...', dbMessage: { id: '...', content: '...', type: 'action', ... } },
        { clientId: '...', dbMessage: { id: '...', content: '...', type: 'action', ... } },
        { clientId: null,  dbMessage: { id: '...', content: '...', type: 'narration', ... } }
      ]
    }

23. Each client:
    a. Receives round:saved
    b. Matches each clientId to its optimistic message in local state
    c. Replaces optimistic message with the DB-confirmed version (real UUID, real created_at)
    d. Appends GM narration message (which was streaming — now replaced with the confirmed DB version)
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

### First Call (in `start-campaign` edge function)

```typescript
const response = await openai.responses.create({
  model: 'gpt-4o',
  instructions: gmSystemPrompt,   // full GM system prompt — only sent once
  input: openingNarrationPrompt,  // opening_situation + player list
  stream: true
})
// save response.id → campaigns.last_response_id
```

### Subsequent Calls (in `game-session` edge function)

```typescript
const response = await openai.responses.create({
  model: 'gpt-4o',
  previous_response_id: campaign.last_response_id,
  input: bundledPlayerActions,  // "Name: action\nName: action"
  stream: true
})
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

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_add_last_response_id.sql` | **New** — add `last_response_id` to campaigns |
| `types/campaign.ts` | **Modify** — add `last_response_id: string \| null` |
| `app/api/campaign/[id]/start/route.ts` | **Modify** — remove `status = 'active'` update (move to edge function) |
| `supabase/functions/start-campaign/index.ts` | **Modify** — add steps 6–13: build GM prompt, call OpenAI, save narration, set response_id, set status active |
| `supabase/functions/game-session/index.ts` | **New** — Deno WebSocket server (main handler) |
| `supabase/functions/game-session/state.ts` | **New** — in-memory CampaignSession map, connection management |
| `supabase/functions/game-session/openai.ts` | **New** — OpenAI Responses API call + streaming |
| `supabase/functions/game-session/debounce.ts` | **New** — debounce timer logic |
| `app/campaign/[slug]/game/GameClient.tsx` | **Modify** — WebSocket connection, optimistic messages, streaming UI |
| `app/campaign/[slug]/game/page.tsx` | **Modify** — pass `last_response_id` to client, handle loading state |

---

## Testing Strategy

| What | How |
|------|-----|
| `start-campaign` — OpenAI call with correct system prompt | Unit test (mock openai) |
| `start-campaign` — saves opening narration to messages | Unit test |
| `start-campaign` — sets `last_response_id` and `status = 'active'` as last step | Unit test |
| `game-session` — rejects connection with invalid JWT | Unit test |
| `game-session` — rejects connection for non-player user | Unit test |
| `game-session` — debounce fires after DEBOUNCE_SECONDS of silence | Unit test (fake timers) |
| `game-session` — debounce resets on new message | Unit test (fake timers) |
| `game-session` — bundles all pending messages into one OpenAI call | Unit test (mock openai) |
| `game-session` — broadcasts chunks to all connected clients | Unit test (mock WebSocket) |
| `game-session` — saves messages atomically on round complete | Unit test |
| `game-session` — updates `last_response_id` after each round | Unit test |
| `game-session` — broadcasts `round:saved` with correct clientId mapping | Unit test |
| Client optimistic message display | Visual/manual |
| Client message replacement on `round:saved` | Visual/manual |
| Client streaming narration display | Visual/manual |
| End-to-end: 2 players, 1 round, full flow | Manual (local Supabase) |
