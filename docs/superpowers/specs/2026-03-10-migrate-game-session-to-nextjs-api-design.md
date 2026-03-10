# Design: Migrate Game-Session WebSocket to Next.js API

**Date:** 2026-03-10
**Status:** Approved
**Branch:** `plan/migrate-game-session-to-nextjs-api`

## Problem

The `game-session` Supabase Edge Function is a Deno WebSocket server. Supabase Edge Functions have wall-clock, CPU, and memory limits that cause 1006 disconnects during active game sessions. The CPU limit (2s) is particularly problematic for streaming AI responses.

## Decision

Replace the WebSocket with:
- REST API routes in Next.js for player actions and round triggers
- Supabase Realtime **broadcast** for all real-time events (chunks, narration, actions, round state)
- **Vercel `after`** for server-side debounce scheduling (no pg_cron)

No persistent connections. No in-memory state. No cold-start disconnects.

---

## Section 1: Architecture

### Current Flow
```
Client ──WS──▶ Supabase Edge Function
                  ├─ saves action to DB
                  ├─ debounces in-memory (8s timer)
                  ├─ calls Anthropic
                  └─ streams chunks ──WS──▶ Client
```

### New Flow
```
Client ──POST /action──▶ Next.js API ──▶ DB (messages)
                                      └─ UPDATE campaigns.next_round_at = NOW() + 8s
                                      └─ broadcast 'action' event
                                      └─ after(sleep 8s → POST /round)  [Vercel after()]

POST /api/game-session/[id]/round (called by after() worker or start route)
  ├─ acquire round_in_progress lock
  ├─ check next_round_at: if > NOW() → skip (debounce extended by later action)
  ├─ broadcast 'round:started'
  ├─ Anthropic stream → broadcast 'chunk' per token
  ├─ save narration → broadcast 'narration' per paragraph
  ├─ broadcast 'round:saved'
  └─ release lock, reset next_round_at = NULL
```

Clients subscribe to one Supabase Realtime broadcast channel: `game:<campaignId>`.

---

## Section 2: API Routes

### `POST /api/game-session/[id]/action`

1. Validate auth (Supabase JWT)
2. Check `campaigns.round_in_progress`
   - If `true` → return `409 { reason: 'round_in_progress' }` — action is **dropped**, never saved to DB
   - If `false` → insert message (`processed: false`), update `next_round_at = NOW() + ROUND_DEBOUNCE_SECONDS`, broadcast `action` event, return `201`
3. Use Vercel `after` to schedule background worker: sleep `ROUND_DEBOUNCE_SECONDS`, then `POST /round`

### `POST /api/game-session/[id]/round`

Called by the `after()` worker or the campaign start route (authenticated via service role key).

1. Acquire `round_in_progress` lock (optimistic update, check returned rows)
2. If lock not acquired → return `409` (another round in progress)
3. Check self-cancelling debounce: if `next_round_at > NOW()` → release lock and return (stale worker)
4. Broadcast `round:started`
5. Atomically claim all `processed=false` actions
6. Load world, players, history from DB
7. Stream Anthropic → broadcast `chunk` per token
8. Save narration paragraphs to DB → broadcast `narration` per paragraph
9. Broadcast `round:saved`
10. Release lock (`round_in_progress = false`, `next_round_at = NULL`) in `finally`

### Dropped Action UX

When `POST /action` returns 409:
- Client shows inline notice near the send button: *"The GM is already reading — your action didn't make it this round"*
- Input field stays **enabled** (player can type their next action)
- **Transmit button disabled** while `round_in_progress = true`
- Button re-enables on `round:saved` broadcast event

---

## Section 3: Client Changes

### Removed
- Entire WebSocket connection `useEffect` (connect, reconnect, `wsRef`, `wsStatus`, `isSilentReconnect`)
- `ws-auth.ts` utility
- WebSocket send path in `handleSend`
- `postgres_changes` subscription on `messages` table

### Added
- `POST /api/game-session/[id]/action` call in `handleSend`
- Supabase Realtime broadcast subscription on `game:<campaignId>` channel

### Broadcast Event Handlers

| Event | Handler |
|---|---|
| `action` | Add to live messages, set `lastActionSentAt` (resets DebounceTimer) |
| `round:started` | Disable transmit button |
| `chunk` | Append to `streamingContent`, set `isStreaming = true` |
| `narration` | Add to live messages |
| `round:saved` | Re-enable button, clear `streamingContent`, set `isStreaming = false` |

### Unchanged
- `DebounceTimer` component — purely visual, still driven by `lastActionSentAt`
- Optimistic messages logic (show immediately, remove on `action` broadcast confirmation)
- `streamingContent` / `isStreaming` state — now fed by broadcast `chunk` instead of WebSocket
- All UI layout, loading states, image reveal

### Initial State
Loaded from DB via server component on page load — unchanged. Broadcast only carries events from connection time forward.

---

## Section 4: Error Handling

| Error | Handling |
|---|---|
| `POST /action` network failure | Client shows retry option; input preserved |
| `POST /action` 401 | Redirect to login |
| `POST /action` 409 | "Late action" inline notice; button stays disabled |
| Anthropic error mid-stream | Broadcast `round:error`; client shows error, re-enables button |
| Round lock never released | `finally` block always releases lock unconditionally |
| Worker fires but round already ran | `round_in_progress` check returns 409; skipped cleanly |

---

## Section 5: DB Changes

```sql
-- Add next_round_at to campaigns for Vercel after()-based debounce scheduling.
-- Each player action sets next_round_at = NOW() + ROUND_DEBOUNCE_SECONDS.
-- The after() worker fires after the debounce window and checks next_round_at <= NOW()
-- before proceeding. If a later action extended the timer, the worker skips.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS next_round_at TIMESTAMPTZ;

-- Remove messages from realtime publication — replaced by Supabase broadcast.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  END IF;
END $$;
```

No pg_cron, no pg_net. Round scheduling is handled entirely by Vercel `after`.

---

## Section 6: Testing

- Unit tests: `POST /action` — auth, lock check, broadcast call, 409 path, malformed JSON 400
- Unit tests: `POST /round` — lock acquire/release, debounce skip, Anthropic mock, broadcast sequence, no-actions path (must emit `round:saved`)
- Lib unit tests: `buildMessageHistory` — empty, opening-only, action+narration rounds
- Lib unit tests: `isFirstCallResponse`, `buildGMSystemPrompt`, `buildFirstCallInput`
- Integration: 2-player scenario — both submit actions, single AI call fires, both receive chunks

---

## Files to Delete

- `supabase/functions/game-session/` (entire directory)
- `app/campaign/[slug]/game/ws-auth.ts`

## Files to Create

- `lib/game-session/config.ts` — shared `ROUND_DEBOUNCE_SECONDS` constant
- `lib/game-session/types.ts` — shared TypeScript types
- `lib/game-session/prompt.ts` — GM system prompt builder
- `lib/game-session/history.ts` — conversation history builder
- `app/api/game-session/[id]/action/route.ts`
- `app/api/game-session/[id]/round/route.ts`
- `supabase/migrations/020_game_session_next_round_at.sql`

## Files to Modify

- `lib/realtime-broadcast.ts` — add `broadcastGameEvent` for `game:` channel
- `app/api/campaign/[id]/start/route.ts` — set `next_round_at`, trigger round via `after()`
- `app/campaign/[slug]/game/GameClient.tsx` — remove WS, add broadcast subscription
- `app/campaign/[slug]/game/components/DebounceTimer.tsx` — import `ROUND_DEBOUNCE_SECONDS`
- `CLAUDE.md` — update architecture section
