# Start Campaign Action Design

**Date:** 2026-03-05
**Status:** Approved

## Goal

When the host clicks "Start Game" in the lobby, trigger AI generation of the opening session content (Current Situation + Starting Hooks + scene image) and redirect all players to the game page.

## Scope

This PR covers everything up to (but not including) the game page UI. The game page is a future PR.

## Database Changes

New columns on `sessions`:
- `opening_situation: text | null` — AI-generated narrative paragraph (3-5 sentences) describing where the party finds themselves
- `starting_hooks: jsonb | null` — JSON array of 2-3 short plot hook strings
- `scene_image_url: text | null` — Gemini-generated scene image URL

`campaigns.status` transitions `'lobby' → 'active'` when start is triggered.

## Flow

1. Host clicks "Start Game" → `POST /api/campaign/[id]/start`
2. API route (sync): validates host + all players ready → sets `campaign.status = 'active'` → broadcasts `game:starting` on `campaign:<id>` → returns 200
3. API route (async, fire-and-forget after response):
   - Create session row (`session_number: 1`, `present_player_ids`)
   - Call Claude with world content + player characters → generate `opening_situation` + `starting_hooks`
   - Save to session row
   - Broadcast `game:started` with payload `{ session_id, opening_situation, starting_hooks }`
   - Call Gemini → generate scene image
   - Save `scene_image_url` to session row
4. All clients (including host) receive `game:starting` → redirect to `/campaign/[id]/game`

## API Route: `POST /api/campaign/[id]/start`

**Auth:** host only — reject 403 if `currentUserId !== campaign.host_user_id`

**Validation:** reject 400 if any player has `is_ready = false`

**Sync response:** 200 `{ ok: true }`

**Broadcast events:**
- `game:starting` — sent before returning, no payload needed
- `game:started` — sent after AI generation, payload: `{ session_id, opening_situation, starting_hooks }`

## AI Prompt (Claude)

Input context:
- World name + world_content (full markdown)
- Each player: character_name, character_class, character_backstory

Output (JSON):
```json
{
  "opening_situation": "3-5 sentence narrative paragraph...",
  "starting_hooks": ["Hook one", "Hook two", "Hook three"]
}
```

## Lobby Changes (`LobbyClient.tsx`)

- "Start Game" button: calls `POST /api/campaign/[id]/start` on click
- New realtime subscription: `game:starting` on `campaign:<id>` → `router.push('/campaign/${id}/game')`

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_add_session_opening.sql` | **New** — add `opening_situation`, `starting_hooks`, `scene_image_url` to sessions |
| `types/session.ts` | **Modify** — add new fields |
| `app/api/campaign/[id]/start/route.ts` | **New** — start campaign endpoint |
| `app/api/campaign/[id]/start/__tests__/route.test.ts` | **New** — unit tests |
| `app/campaign/[id]/lobby/LobbyClient.tsx` | **Modify** — wire button + game:starting subscription |

## Testing Strategy

| What | How |
|------|-----|
| `POST /start` — rejects non-host | Unit test |
| `POST /start` — rejects if not all players ready | Unit test |
| `POST /start` — broadcasts `game:starting`, returns 200 | Unit test (mock broadcast) |
| Async work — Claude called with correct prompt shape | Unit test (mock anthropic) |
| Async work — session created + saved correctly | Unit test |
| Async work — `game:started` broadcast with correct payload | Unit test |
| Lobby redirect on `game:starting` | Visual/manual |
