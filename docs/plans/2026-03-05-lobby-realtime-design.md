# Lobby Realtime Events Design

**Date:** 2026-03-05
**Status:** Approved

## Goal

When a player saves their character or marks ready in the lobby, all other connected clients (players and host) see the update immediately — without a page refresh. The host's "Start Game" button enables automatically when all players are ready.

## Decisions

- **Mechanism:** Supabase Realtime Broadcast (consistent with setup page pattern)
- **Channel:** `campaign:<campaignId>` (shared with `world:*` events from world generation)
- **Event:** Single `player:updated` event with full player row as payload
- **Subscriber:** `LobbyClient.tsx` via `useEffect` on mount

## Architecture

**Publishers:** Two API routes broadcast after every successful DB write:
- `PATCH /api/campaign/[id]/player` (character save)
- `PATCH /api/campaign/[id]/ready` (ready toggle)

**Subscriber:** `LobbyClient.tsx` subscribes to `player:updated` on `campaign:<id>`. On each event, merges the incoming player into `players` state by `id`. `allReady` recomputes automatically.

**Broadcast helper:** New `lib/realtime-broadcast.ts` — Node.js-compatible fetch against `${SUPABASE_URL}/realtime/v1/api/broadcast` with service role key. Fire-and-forget (errors swallowed).

## Data Flow

### On character save (`PATCH /player`):
1. Update `character_name`, `character_class`, `character_backstory` in DB
2. Get back full updated player row
3. Call `broadcastPlayerUpdate(campaignId, updatedPlayer)` — fire-and-forget
4. Return 200

### On ready toggle (`PATCH /ready`):
1. Update `is_ready` in DB
2. Get back full updated player row
3. Call `broadcastPlayerUpdate(campaignId, updatedPlayer)` — fire-and-forget
4. Return 200

### In `LobbyClient.tsx`:
```
useEffect → subscribe to campaign:<id> on broadcast 'player:updated'
  → received payload: full DBPlayer row
  → setPlayers(prev => prev.map(p => p.id === payload.id ? merge(p, payload) : p))
  → allReady recomputes → Start Game button enables/disables
cleanup → unsubscribe on unmount
```

The broadcasting user also receives their own event. The merge is idempotent — same data as the optimistic update already applied. No visual flicker.

## Files Changed

| File | Change |
|------|--------|
| `lib/realtime-broadcast.ts` | **New** — Node.js broadcast helper |
| `app/api/campaign/[id]/player/route.ts` | **Modify** — broadcast after character save |
| `app/api/campaign/[id]/ready/route.ts` | **Modify** — broadcast after ready toggle |
| `app/campaign/[id]/lobby/LobbyClient.tsx` | **Modify** — add realtime subscription |

## Testing Strategy

| What | How |
|------|-----|
| `broadcastPlayerUpdate` helper | Unit test (vitest) — mock fetch, assert URL/headers/body |
| Broadcast called after character save | Unit test — assert `broadcastPlayerUpdate` called with updated player |
| Broadcast called after ready toggle | Unit test — assert `broadcastPlayerUpdate` called with updated player |
| Lobby realtime updates | Visual/manual — two browser tabs, update in one, see in other |
| Start Game button auto-enables | Visual/manual — all players mark ready → button enables without refresh |
