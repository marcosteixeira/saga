# AGENTS.md — AI Agents & Edge Functions

This document describes the AI-powered agents that drive Saga's gameplay. All agents run as Supabase Edge Functions (Deno runtime).

---

## game-session

**Path:** `supabase/functions/game-session/`
**Model:** OpenAI GPT-4o (Responses API)
**Transport:** WebSocket
**Auth:** Supabase JWT via `Sec-WebSocket-Protocol: jwt-<token>`

### What it does

The game-session agent is the AI Game Master. It manages the real-time game loop for a campaign:

- **Opening narration** — On first connection (when `campaigns.last_response_id` is `null`), calls GPT-4o to generate an opening scene based on world content and player characters.
- **Round processing** — As players submit actions, messages are debounced (300ms window) and batched. When the debounce fires, the agent sends all pending actions to GPT-4o in a single call and streams the narration back to all connected players.
- **Conversation threading** — Uses OpenAI Responses API `previous_response_id` to maintain stateful conversation context without resending full history. The response ID is persisted in `campaigns.last_response_id`.
- **Streaming** — Narration is streamed token-by-token to clients via WebSocket `chunk` events. After completion, a `round:saved` event delivers the persisted DB message rows.

### State model

In-memory per-campaign state (lost on cold starts):

| Field | Description |
|-------|-------------|
| `connections` | Set of open WebSocket sockets |
| `pendingMessages` | Player actions queued for the current debounce window |
| `nextRoundMessages` | Actions arriving while a round is in progress (queued for next round) |
| `isProcessing` | Whether a GPT-4o call is currently in flight |

### Race safety

Multiple players connecting simultaneously could each trigger the opening narration. This is prevented by an optimistic DB update: the first connection sets `last_response_id = 'pending'` and re-fetches to confirm it won the race. Others wait for the `round:saved` broadcast.

### Input/Output format

GPT-4o responses are structured JSON:
- **First call**: `{ world_context: string, narration: string[] }`
- **Subsequent rounds**: `{ actions: [{ clientId, playerName, content }], narration: string[] }`

### Environment variables

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`

---

## generate-world

**Path:** `supabase/functions/generate-world/`
**Model:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`, Anthropic)
**Trigger:** Supabase Database Webhook (on `worlds` INSERT with `status = 'pending'`)
**Auth:** Shared webhook secret (`GENERATE_WORLD_WEBHOOK_SECRET`)

### What it does

Generates rich world lore from the host's short description:

1. Receives world record via webhook payload
2. Calls Claude Haiku with the world description and a structured system prompt
3. Validates the response against required sections (up to 3 retries)
4. Parses and validates player classes from the content
5. Saves clean `world_content` (WORLD.md) and `classes` (JSONB) to the `worlds` table
6. Triggers `generate-image` for `cover` and `map` image types in parallel

Progress and completion are broadcast on `world:<world_id>` via Supabase Realtime so the client can show live status.

### Validation

Required sections are checked by `getMissingRequiredSections()` in `world-content.ts`. If sections are missing after 3 attempts, the world is marked `status: 'error'`.

### Environment variables

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `GENERATE_WORLD_WEBHOOK_SECRET`
- `GENERATE_IMAGE_WEBHOOK_SECRET` (used to trigger generate-image)

---

## generate-image

**Path:** `supabase/functions/generate-image/`
**Model:** Gemini `gemini-3-pro-image-preview` (Google AI)
**Trigger:** HTTP POST (internal, called by generate-world or other services)
**Auth:** Shared webhook secret (`GENERATE_IMAGE_WEBHOOK_SECRET`)

### What it does

Generates images for worlds, campaigns, and players:

| `entity_type` | `image_type` | Description |
|---------------|--------------|-------------|
| `world`       | `cover`      | World cover art |
| `world`       | `map`        | World map illustration |
| `campaign`    | `scene`      | In-game scene image |
| `player`      | `portrait`   | Character portrait |

Flow per request:
1. Find or create an `images` row (singleton types like `cover`/`map` reset existing rows; multi-types like `portrait` insert new rows)
2. Build a prompt from world/campaign/player content in the DB
3. Call Gemini with `responseModalities: ["IMAGE"]`
4. Upload the PNG to Supabase Storage (`campaign-images` bucket)
5. Update the `images` row with `status: 'ready'` and `public_url`
6. Broadcast `image:ready` on `world:<world_id>` channel

### Environment variables

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GENERATE_IMAGE_WEBHOOK_SECRET`

---

## Broadcast Channels

Agents communicate status to the frontend via Supabase Realtime broadcast:

| Channel | Events |
|---------|--------|
| `world:<world_id>` | `world:started`, `world:progress`, `world:complete`, `world:error`, `image:ready` |
| WebSocket (game-session) | `chunk`, `round:saved`, `player:action`, `error` |
