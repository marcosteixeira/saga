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
| Game narration | Claude Sonnet 4.6      | `app/api/game-session/`                 |
| World gen      | Claude Haiku 4.5       | `supabase/functions/generate-world/`    |
| Image gen      | Gemini (`gemini-3-pro-image-preview`) | `supabase/functions/generate-image/` |

### Game session flow

Player actions go through `POST /api/game-session/[id]/action` (Next.js API route). Each action:
1. Checks `round_in_progress` — returns 409 if a round is running (action dropped)
2. Saves message to `messages` table (`processed: false`)
3. Sets `campaigns.next_round_at = NOW() + ROUND_DEBOUNCE_SECONDS` (debounce window)
4. Broadcasts the action via Supabase Realtime broadcast on `game:<campaignId>`
5. Uses Vercel `after` to schedule a background worker that sleeps `ROUND_DEBOUNCE_SECONDS`
   then calls `POST /api/game-session/[id]/round`

The round route (called by the `after()` worker or the start route):
1. Acquires `round_in_progress` lock (race-safe)
2. Checks self-cancelling debounce: if `next_round_at > NOW()`, a later action extended the timer
   — release lock and skip (the newer worker will fire instead)
3. Streams from Anthropic, broadcasting `chunk` events on `game:<campaignId>`
4. Saves narration to DB, broadcasts `narration` and `round:saved` events
5. Releases lock and resets `next_round_at = NULL`

`ROUND_DEBOUNCE_SECONDS` is a shared constant in `lib/game-session/config.ts` used by both
the action route (server) and the `DebounceTimer` UI component (client).

Clients subscribe to `game:<campaignId>` broadcast channel for all real-time events.
Initial messages are loaded via the server component on page load.

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
| `app/api/game-session/[id]/action/route.ts` | Player action handler |
| `app/api/game-session/[id]/round/route.ts` | AI round handler (streaming) |
| `lib/game-session/config.ts` | Shared constants (`ROUND_DEBOUNCE_SECONDS`) |
| `lib/game-session/prompt.ts` | GM system prompt builder |
| `lib/game-session/history.ts` | Conversation history reconstruction |
| `supabase/functions/generate-world/index.ts` | World gen orchestration |
| `supabase/functions/generate-world/world-content.ts` | Section validation, class parsing |
| `supabase/functions/generate-image/index.ts` | Gemini image gen + Supabase Storage upload |
| `app/campaign/[slug]/game/GameClient.tsx` | Game room UI + Realtime broadcast client |
| `lib/memory.ts` | Campaign memory file read/write helpers |
| `lib/realtime-broadcast.ts` | Supabase Realtime broadcast helpers |

## Database

Migrations live in `supabase/migrations/` (001–014). Key tables:

- `campaigns` — campaign metadata, `last_response_id` (`null` → `pending` → `done`), `world_id`
- `worlds` — `world_content` (WORLD.md), `classes` (JSONB), `status`
- `players` — per-campaign player records linked to `auth.users`
- `messages` — game log (actions + narration), `player_id = null` for AI messages
- `images` — image generation status + storage paths (`cover`, `map`, `portrait`, etc.)
- `campaign_files` — key/value MD files per campaign (MEMORY.md, CHARACTERS.md, etc.)

## Testing

- Tests use Vitest with mocks for edge runtime, Supabase, and Anthropic
- Mock stubs in `supabase/functions/__mocks__/`
- Each edge function has a `__tests__/` directory next to its source

## Environment Variables

```env
# Next.js
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=         # Claude Sonnet for game narration + Haiku for world gen
GEMINI_API_KEY=            # Gemini for image gen

# Edge function secrets
GENERATE_WORLD_WEBHOOK_SECRET=   # Shared secret for generate-world webhook
GENERATE_IMAGE_WEBHOOK_SECRET=   # Shared secret for generate-image calls
```

## Conventions

- **TypeScript strict mode** everywhere
- **Server components** by default; `'use client'` only when needed
- **Optimistic race guards**: `round_in_progress` lock + self-cancelling debounce via `next_round_at` prevent duplicate rounds
- **Structured logging**: edge functions emit `JSON.stringify({ level, event, ...meta })` — never bare `console.log` strings
