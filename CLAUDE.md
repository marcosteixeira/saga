# CLAUDE.md — Developer Guide

## Commands

```bash
yarn dev          # Start Next.js dev server (port 3000)
yarn test         # Run all tests (Vitest)
yarn test:watch   # Watch mode
yarn lint         # ESLint
yarn build        # Production build
```

## Architecture

### AI split

| Concern        | Model                  | Location                                |
| -------------- | ---------------------- | --------------------------------------- |
| Game narration | OpenAI GPT-4o          | `supabase/functions/game-session/`      |
| World gen      | Claude Haiku 4.5       | `supabase/functions/generate-world/`    |
| Image gen      | Gemini (`gemini-3-pro-image-preview`) | `supabase/functions/generate-image/` |

The game-session edge function uses OpenAI Responses API with `previous_response_id` for stateful conversation threading — it does **not** send full message history each round.

### Game session WebSocket

The game-session edge function (`supabase/functions/game-session/index.ts`) is a Deno WebSocket server. Clients connect via `wss://` and pass a Supabase JWT in `Sec-WebSocket-Protocol: jwt-<token>`. The server:

1. Authenticates the token against Supabase Auth and looks up the player record
2. On first connection with `last_response_id = null`, runs the opening narration (race-safe via optimistic update to `pending`)
3. Queues player action messages with a debounce; when debounce fires, calls GPT-4o with the batch
4. Broadcasts `chunk` events during streaming, then `round:saved` with the persisted DB rows

### World generation flow

1. `POST /api/campaign` creates a `worlds` row with `status: 'pending'`
2. A Supabase webhook fires `generate-world` edge function
3. Claude Haiku generates WORLD.md content (up to 3 retries for missing sections)
4. World content saved to `worlds.world_content`; classes extracted and saved to `worlds.classes`
5. `generate-image` triggered (via internal HTTP) for `cover` and `map` images in parallel
6. All progress broadcast on channel `world:<world_id>` via Supabase Realtime

### Auth

- Supabase Auth with email/magic link or OAuth (configured in your Supabase project)
- Server components use `lib/supabase/server.ts` (cookie-based)
- Client components use `lib/supabase/client.ts` (browser)
- Edge functions receive a JWT via `Sec-WebSocket-Protocol` header and verify with `SUPABASE_ANON_KEY`

## Key Files

| File | Purpose |
|------|---------|
| `supabase/functions/game-session/index.ts` | WebSocket handler, round orchestration |
| `supabase/functions/game-session/state.ts` | In-memory session state (connections, pending messages) |
| `supabase/functions/game-session/prompt.ts` | GM system prompt builder |
| `supabase/functions/game-session/openai.ts` | OpenAI response parsing |
| `supabase/functions/game-session/debounce.ts` | Per-campaign debounce timer |
| `supabase/functions/generate-world/index.ts` | World gen orchestration |
| `supabase/functions/generate-world/world-content.ts` | Section validation, class parsing |
| `supabase/functions/generate-image/index.ts` | Gemini image gen + Supabase Storage upload |
| `app/campaign/[slug]/game/GameClient.tsx` | Game room UI + WebSocket client |
| `lib/memory.ts` | Campaign memory file read/write helpers |
| `lib/realtime-broadcast.ts` | Supabase Realtime broadcast helpers |

## Database

Migrations live in `supabase/migrations/` (001–014). Key tables:

- `campaigns` — campaign metadata, `last_response_id` (OpenAI), `world_id`
- `worlds` — `world_content` (WORLD.md), `classes` (JSONB), `status`
- `players` — per-campaign player records linked to `auth.users`
- `messages` — game log (actions + narration), `player_id = null` for AI messages
- `images` — image generation status + storage paths (`cover`, `map`, `portrait`, etc.)
- `campaign_files` — key/value MD files per campaign (MEMORY.md, CHARACTERS.md, etc.)

## Testing

- Tests use Vitest with mocks for edge runtime, Supabase, and OpenAI
- Mock stubs in `supabase/functions/__mocks__/`
- Each edge function has a `__tests__/` directory next to its source

## Environment Variables

```env
# Next.js
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
OPENAI_API_KEY=            # GPT-4o for game narration
ANTHROPIC_API_KEY=         # Claude Haiku for world gen
GEMINI_API_KEY=            # Gemini for image gen

# Edge function secrets
GENERATE_WORLD_WEBHOOK_SECRET=   # Shared secret for generate-world webhook
GENERATE_IMAGE_WEBHOOK_SECRET=   # Shared secret for generate-image calls
```

## Conventions

- **TypeScript strict mode** everywhere
- **Server components** by default; `'use client'` only when needed
- **No session management in Next.js API routes** — game state lives in the WebSocket edge function
- **Optimistic race guards**: `last_response_id = 'pending'` prevents duplicate first-calls when multiple players connect simultaneously
- **Structured logging**: edge functions emit `JSON.stringify({ level, event, ...meta })` — never bare `console.log` strings
