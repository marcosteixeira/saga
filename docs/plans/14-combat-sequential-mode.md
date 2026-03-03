# PR 14: Combat Mode (Sequential Turns)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement sequential turn mode for combat: players act one at a time in a defined order. The host can toggle between free mode and sequential mode. Only the active player can submit actions.

**Architecture:** Turn order is stored on the campaign row (or a separate state object). The server tracks whose turn it is. When in sequential mode, only the active player's input is enabled. After each player submits, the next player is activated. After all players have acted, narration is triggered. The host can toggle modes at any time.

**Tech Stack:** Supabase Realtime, Next.js API routes

**Depends on:** PR 12

---

## Design System Reference

All UI work in this PR must follow the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

**Applicable to this PR:**

- **Active player highlight in `PlayerList`:** The currently acting player's card gets a `--brass` border glow (`box-shadow: 0 0 12px rgba(196,148,61,0.6)`) and a small animated gear icon (slow rotation, `--brass`) next to their name indicating it's their turn.
- **"YOUR TURN" indicator:** A prominent banner or chip appears above the ActionInput in `Pragati Narrow` uppercase, `--amber` color with furnace glow — unmissable. Optionally animate in with a brief steam burst from the bottom.
- **ActionInput — active turn:** Full enabled state, `--brass` focus ring. Placeholder: `"DECLARE YOUR ACTION..."` in `Share Tech Mono`.
- **ActionInput — not your turn:** Standard disabled state (`--gunmetal`, `--ash`). Show `"OPERATOR [NAME]'S TURN"` in `Share Tech Mono` as placeholder.
- **Mode toggle (Free / Sequential):** Host control rendered as a Leather Strap tab pair. Active tab shows `--brass` rivet indicator.
- **Turn order display:** Optional compact row in the sidebar or top bar showing player avatars in sequence, with the current player's avatar highlighted with `--brass` ring.

---

### Task 1: Add Turn Order State

**Files:**
- Modify: `supabase/migrations/` — add new migration
- Modify: `types/index.ts`

**Spec:**

Add a `turn_state` JSONB column to the `campaigns` table:

```sql
ALTER TABLE campaigns ADD COLUMN turn_state JSONB DEFAULT '{}';
```

TypeScript type:
```typescript
type TurnState = {
  order: string[]           // player IDs in turn order
  current_index: number     // index of the active player
  round: number             // current combat round
}
```

When `turn_mode = 'sequential'` and `turn_state` is populated, the game is in combat mode.

**Step 1: Write migration**

Create: `supabase/migrations/002_turn_state.sql`

**Step 2: Update types**

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add turn_state column to campaigns"
```

---

### Task 2: Build Turn Mode Toggle API

**Files:**
- Create: `app/api/campaign/[id]/turn-mode/route.ts`
- Create: `app/api/campaign/[id]/turn-mode/__tests__/route.test.ts`

**Spec:**

`PATCH /api/campaign/[id]/turn-mode`

No special headers — host identified via Supabase auth session.

Request body:
```json
{
  "mode": "sequential",
  "turn_order": ["player-id-1", "player-id-2", "player-id-3"]
}
```

Or to switch back:
```json
{
  "mode": "free"
}
```

Behavior:
- `mode: "sequential"`: set `turn_mode = 'sequential'`, set `turn_state = { order, current_index: 0, round: 1 }`
- `mode: "free"`: set `turn_mode = 'free'`, set `turn_state = {}`
- Only host can toggle
- Broadcast the mode change to all clients

When entering sequential mode without `turn_order`:
- Default order: all active players sorted by `joined_at`

**Step 1: Write tests**

```typescript
describe('PATCH /api/campaign/[id]/turn-mode', () => {
  it('returns 401 when not authenticated', ...)
  it('returns 403 when not the host', ...)
  it('switches to sequential mode with turn order', ...)
  it('defaults turn order to active players by join date', ...)
  it('switches back to free mode and clears turn state', ...)
  it('broadcasts mode change', ...)
})
```

6 test cases. Use the same auth mock pattern as other routes:
```typescript
vi.mock('@/lib/supabase/server', () => ({
  createServerAuthClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom, channel: ... }))
}))
```

**Step 2: Run tests — fail**

**Step 3: Implement**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: turn mode toggle API"
```

---

### Task 3: Build Sequential Turn Advancement

**Files:**
- Create: `lib/sequential-turns.ts`
- Create: `lib/__tests__/sequential-turns.test.ts`

**Spec:**

```typescript
// Advance to the next player in the turn order
advanceTurn(campaignId: string): Promise<{
  nextPlayerId: string | null  // null if round is complete
  roundComplete: boolean
  newRound: number
}>
```

Logic:
1. Fetch campaign's `turn_state`
2. Increment `current_index`
3. If `current_index >= order.length`: round complete, reset to 0, increment round
4. Skip dead/incapacitated players
5. Skip absent players with `skip` absence mode
6. Update `turn_state` in DB
7. Broadcast turn change to all clients

```typescript
// Get the current active player in sequential mode
getCurrentTurnPlayer(campaignId: string): Promise<string | null>
```

**Step 1: Write tests**

```typescript
describe('advanceTurn', () => {
  it('advances to the next player in order', ...)
  it('wraps around at end of order (new round)', ...)
  it('skips dead players', ...)
  it('skips incapacitated players', ...)
  it('skips absent players with skip mode', ...)
  it('includes absent players with npc mode', ...)
})

describe('getCurrentTurnPlayer', () => {
  it('returns the player at current_index', ...)
  it('returns null when turn_state is empty', ...)
})
```

8 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: sequential turn advancement logic"
```

---

### Task 4: Enforce Turn Order in Message Submission

**Files:**
- Modify: `app/api/campaign/[id]/message/route.ts`
- Modify: `lib/turns.ts`

**Spec:**

Update the message submission route:

When `turn_mode = 'sequential'`:
1. Check if the submitting player is the current active player
2. If not: return 403 with "Not your turn"
3. If yes: save message, advance turn
4. If round complete (all players have acted): trigger narration
5. Broadcast turn advancement

When `turn_mode = 'free'`: existing behavior (unchanged)

**Step 1: Update tests**

```typescript
it('returns 403 when submitting out of turn in sequential mode', ...)
it('advances turn after submission in sequential mode', ...)
it('triggers narration when round is complete in sequential mode', ...)
```

3 new test cases.

**Step 2: Run tests — fail**

**Step 3: Update implementation**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: enforce turn order in sequential mode"
```

---

### Task 5: Update Game Room UI for Sequential Mode

**Files:**
- Modify: `components/game/ActionInput.tsx`
- Modify: `components/game/TurnIndicator.tsx`
- Modify: `components/game/PlayerList.tsx`
- Modify: `components/game/GameRoom.tsx`

**Spec:**

**ActionInput changes:**
- In sequential mode: disabled unless it's the current player's turn
- Placeholder: "It's {PlayerName}'s turn..." when disabled
- Enabled with "Your turn! Describe your action..." when it's their turn

**TurnIndicator changes:**
- In sequential mode: show "Round {X} — {PlayerName}'s Turn"
- Highlight the active player
- Show turn order list (who's next)

**PlayerList changes:**
- Active turn player gets a glowing border or arrow indicator
- Dimmed players who haven't had their turn yet (or have already gone)

**GameRoom changes:**
- Subscribe to turn state changes via Supabase Realtime
- When turn mode changes: update UI accordingly
- Host sees a "Toggle Combat Mode" button in the sidebar

**Step 1: Add host toggle button**

A button in the sidebar that calls PATCH `/api/campaign/[id]/turn-mode`. Shows "Enter Combat" (sequential) or "Exit Combat" (free).

**Step 2: Update TurnIndicator for sequential mode**

**Step 3: Update ActionInput for turn enforcement**

**Step 4: Update PlayerList for active turn highlighting**

**Step 5: Visual test**

- Host clicks "Enter Combat" → all clients see mode change
- Only active player's input is enabled
- TurnIndicator shows whose turn it is and round number
- Active player highlighted in sidebar
- Player submits → next player activated
- All players submit → narration triggers
- Host clicks "Exit Combat" → all players' inputs enabled again

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: sequential mode UI with turn enforcement"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| PATCH /api/campaign/[id]/turn-mode | Unit test (vitest) | 5 tests: auth, sequential, default order, free, broadcast |
| advanceTurn | Unit test (vitest) | 6 tests: advance, wrap, skip dead/incap/absent, include NPC |
| getCurrentTurnPlayer | Unit test (vitest) | 2 tests: valid state, empty state |
| Turn enforcement in message route | Unit test (vitest) | 3 tests: out-of-turn, advance, round-complete |
| Sequential mode UI | Visual/manual | Turn enforcement, active player highlight, mode toggle |
| Full combat loop | Manual | Enter combat → sequential actions → narration → next round |

---

## Acceptance Criteria

- [ ] Turn mode toggle API validates host and switches modes (5 tests passing)
- [ ] Turn advancement logic skips dead/incap/absent players (8 tests passing)
- [ ] Message submission enforces turn order in sequential mode (3 tests passing)
- [ ] UI disables input for non-active players in sequential mode
- [ ] TurnIndicator shows round and active player in sequential mode
- [ ] PlayerList highlights active turn player
- [ ] Host can toggle between free and sequential mode
- [ ] Full combat round triggers narration after all players act
- [ ] `yarn build` succeeds
