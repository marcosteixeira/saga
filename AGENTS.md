# AGENTS.md — AI Agents & Edge Functions

This document describes the AI-powered agents that drive Saga's gameplay. All agents run as Supabase Edge Functions (Deno runtime).

---

## game-session

**Path:** `supabase/functions/game-session/`
**Model:** OpenAI GPT-4o (Responses API)

### What it does

The game-session directory contains helper modules for the AI Game Master:

- **`prompt.ts`** — Builds the GM system prompt from world content and player characters. Defines the structured JSON schemas GPT-4o must follow: a first-call schema (world context + opening situation + starting hooks + narration) and a round schema (player actions + narration).
- **`openai.ts`** — Extracts narration string arrays from raw GPT-4o JSON responses for both first-call and round response shapes.

### Input/Output format

GPT-4o responses are structured JSON:
- **First call**: `{ world_context: { history, factions, tone }, opening_situation, starting_hooks, actions: [], narration: string[] }`
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
