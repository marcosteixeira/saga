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
- **pg_cron** for server-side debounce and round scheduling

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
                                      └─ UPDATE campaigns.fire_at = NOW() + 8s
                                      └─ broadcast 'action' event

pg_cron (every 2s): fire_at <= NOW() AND round_in_progress = false
  └─▶ POST /api/game-session/[id]/round (internal)
        ├─ acquire round_in_progress lock
        ├─ 1s grace delay
        ├─ broadcast 'round:started'
        ├─ Anthropic stream → broadcast 'chunk' per token
        ├─ save narration → broadcast 'narration' per paragraph
        ├─ broadcast 'round:saved'
        └─ release lock, reset fire_at = NULL
```

Clients subscribe to one Supabase Realtime broadcast channel: `game:<campaignId>`.

---

## Section 2: API Routes

### `POST /api/game-session/[id]/action`

1. Validate auth (Supabase JWT)
2. Check `campaigns.round_in_progress`
   - If `true` → return `409 { reason: 'round_in_progress' }` — action is **dropped**, never saved to DB
   - If `false` → insert message (`processed: false`), update `fire_at = NOW() + 8s`, broadcast `action` event, return `201`

### `POST /api/game-session/[id]/round`

Called by pg_cron (authenticated via service token).

1. Acquire `round_in_progress` lock (optimistic update, check returned rows)
2. If lock not acquired → return `409` (another round in progress)
3. Wait 1s grace period (catches in-flight action POSTs)
4. Broadcast `round:started`
5. Atomically claim all `processed=false` actions
6. Load world, players, history from DB
7. Stream Anthropic → broadcast `chunk` per token
8. Save narration paragraphs to DB → broadcast `narration` per paragraph
9. Broadcast `round:saved`
10. Release lock (`round_in_progress = false`, `fire_at = NULL`) in `finally`

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
| Round lock never released | `finally` block always releases; pg_cron retries next tick |

---

## Section 5: DB Changes

```sql
-- Add fire_at to campaigns for server-side debounce scheduling
ALTER TABLE campaigns ADD COLUMN fire_at TIMESTAMPTZ;

-- Enable pg_cron + pg_net for scheduled round triggers
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cron: every 2s, trigger rounds that are due
SELECT cron.schedule('fire-rounds', '*/2 * * * * *', $$
  SELECT net.http_post(
    url := current_setting('app.base_url') || '/api/game-session/' || id || '/round',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_token')),
    body := '{}'::jsonb
  )
  FROM campaigns
  WHERE fire_at <= NOW()
    AND round_in_progress = false
    AND fire_at IS NOT NULL;
$$);

-- Remove messages from realtime publication (no longer needed)
ALTER PUBLICATION supabase_realtime DROP TABLE messages;
```

---

## Section 6: Testing

- Unit tests: `POST /action` — auth, lock check, broadcast call, 409 path
- Unit tests: `POST /round` — lock acquire/release, grace delay, Anthropic mock, broadcast sequence
- Existing edge function tests adapted to Next.js API route shape (same logic)
- `pg_cron` tested via manual trigger in dev (`SELECT cron.run_job(...)`)
- Integration: 2-player scenario — both submit actions, single AI call fires, both receive chunks

---

## Files to Delete

- `supabase/functions/game-session/` (entire directory)
- `app/campaign/[slug]/game/ws-auth.ts`

## Files to Create

- `app/api/game-session/[id]/action/route.ts`
- `app/api/game-session/[id]/round/route.ts`
- `supabase/migrations/020_game_session_fire_at.sql`

## Files to Modify

- `app/campaign/[slug]/game/GameClient.tsx` — remove WS, add broadcast subscription
- `CLAUDE.md` — update architecture section
