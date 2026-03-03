# PR 08: Lobby Realtime + Character Portraits

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time updates to the lobby (players see each other join live) and generate AI character portraits via Gemini. Add the session start flow so the host can kick off gameplay.

**Architecture:** Supabase Realtime Postgres Changes subscription on the `players` table filtered by campaign_id. When a new player joins, all connected clients receive the update and re-render the player list. Character portraits are generated asynchronously after a player joins.

**Tech Stack:** Supabase Realtime (Postgres Changes), Gemini image generation

**Depends on:** PR 07, PR 06

---

## Design System Reference

All UI work in this PR must follow the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

**Applicable to this PR:**

- **Player join animation:** When a new player appears in the realtime-updated list, animate them in with a brief steam burst + fade-in (translate from slight bottom offset, opacity 0 → 1, ~300ms ease-out).
- **Character portraits:** Display as circular crops with a `--brass` border ring (2px). While portrait is generating, show the piston animation shimmer placeholder in `--smog`. Portrait frame can optionally use a Copper Gauge Panel ring for emphasis.
- **"Session starting" transition:** When host starts the session, all clients should see a dramatic full-screen steam burst overlay (white-to-transparent particles burst from bottom edge) before routing to the game room.

---

### Task 1: Add Realtime Player List Subscription

**Files:**
- Create: `lib/realtime.ts`
- Modify: `app/campaign/[id]/lobby/page.tsx`

**Spec:**

`lib/realtime.ts` — helper for Supabase Realtime subscriptions:

```typescript
// Subscribe to player changes for a campaign
subscribeToPlayers(
  campaignId: string,
  onPlayerChange: (payload: RealtimePayload) => void
): RealtimeChannel

// Unsubscribe
unsubscribeFromChannel(channel: RealtimeChannel): void
```

Uses Supabase Realtime Postgres Changes:
```typescript
supabase.channel(`lobby:${campaignId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'players',
    filter: `campaign_id=eq.${campaignId}`
  }, callback)
  .subscribe()
```

**Lobby integration:**

In the lobby page component:
1. On mount: subscribe to player changes
2. On `INSERT` event: add new player to local state
3. On `UPDATE` event: update player in local state (for portrait URL updates)
4. On unmount: unsubscribe

**Step 1: Implement `lib/realtime.ts`**

**Step 2: Integrate into lobby page**

Add `useEffect` that subscribes on mount. Manage player list with `useState`, seeded from initial fetch, updated by realtime events.

**Step 3: Visual test**

- Open lobby in two browser tabs
- Join in Tab 2 → Tab 1 sees the new player appear without refreshing
- Player portrait updates appear in real-time (once Task 2 is done)

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: realtime player list in lobby via Supabase"
```

---

### Task 2: Generate Character Portraits on Join

**Files:**
- Modify: `app/api/campaign/[id]/join/route.ts`

**Spec:**

After a player joins successfully, trigger character portrait generation as a background task:

1. Build portrait prompt from character details: `"Fantasy RPG character portrait: {character_name}, a {character_class}. {character_backstory excerpt}"`
2. Call `POST /api/campaign/[id]/image` internally (or call `generateAndStoreImage` directly) with type `character`
3. On success: update player row with `character_image_url`
4. This is fire-and-forget — the join response returns immediately

Only generate a portrait if `character_name` is provided. If the player joins without character details, no portrait is generated.

**Step 1: Update join route tests**

```typescript
it('triggers portrait generation when character_name is provided', async () => {
  // Verify generateAndStoreImage is called with character prompt
})

it('does not trigger portrait generation when character_name is empty', async () => {
  // Verify generateAndStoreImage is NOT called
})
```

**Step 2: Run tests — fail**

**Step 3: Update join route implementation**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: generate character portrait on join"
```

---

### Task 3: Display Character Portraits in Lobby

**Files:**
- Modify: `app/campaign/[id]/lobby/page.tsx`

**Spec:**

Update the player list in the lobby to show:
- Character portrait (avatar) — or a placeholder icon if not yet generated
- Username
- Character name + class (if provided)
- "Host" badge for the host player
- Skeleton/shimmer while portrait is being generated

When a realtime UPDATE event arrives with a new `character_image_url`, update the avatar from placeholder to the actual portrait.

**Step 1: Update player list rendering**

Use shadcn `Avatar` component. Show `AvatarFallback` with initials while portrait generates. Show `AvatarImage` once URL is available.

**Step 2: Visual test**

- Join with character details → avatar shows initials placeholder
- After a few seconds, portrait generates → avatar updates to actual image
- Other players in the lobby see the portrait update in real-time

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: character portraits in lobby player list"
```

---

### Task 4: Session Start API Route

**Files:**
- Create: `app/api/campaign/[id]/session/start/route.ts`
- Create: `app/api/campaign/[id]/session/start/__tests__/route.test.ts`

**Spec:**

`POST /api/campaign/[id]/session/start`

Request headers:
- `x-session-token: <host_session_token>` — to verify the requester is the host

Behavior:
1. Validate campaign exists and status is `lobby` or `paused`
2. Verify the session token matches the campaign's `host_session_token`
3. Create a new `sessions` row (session_number = count of existing sessions + 1)
4. Set `present_player_ids` to all active players
5. Update campaign: `status = 'active'`, `current_session_id = new session id`
6. Return `{ session: { id, session_number } }` with status 200

Error responses:
- 404: campaign not found
- 403: not the host
- 400: campaign not in startable state (not lobby/paused)

**Step 1: Write tests**

```typescript
describe('POST /api/campaign/[id]/session/start', () => {
  it('returns 404 when campaign not found', ...)
  it('returns 403 when session token does not match host', ...)
  it('returns 400 when campaign is already active', ...)
  it('returns 200 and creates session on success', ...)
  it('updates campaign status to active', ...)
  it('sets present_player_ids to all active players', ...)
})
```

6 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: POST /api/campaign/[id]/session/start"
```

---

### Task 5: Wire Up Host "Start Session" Button

**Files:**
- Modify: `app/campaign/[id]/lobby/page.tsx`

**Spec:**

The "Start Session" button:
1. Only visible to the host (match session token from localStorage with campaign's host_session_token)
2. Disabled until at least 1 non-host player has joined
3. On click: POST to `/api/campaign/[id]/session/start` with session token in header
4. On success: redirect to `/campaign/[id]` (game room)

Also: subscribe to campaign status changes via Supabase Realtime. When status changes to `active`, all lobby clients redirect to the game room.

```typescript
supabase.channel(`campaign-status:${campaignId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'campaigns',
    filter: `id=eq.${campaignId}`
  }, (payload) => {
    if (payload.new.status === 'active') {
      router.replace(`/campaign/${campaignId}`)
    }
  })
  .subscribe()
```

**Step 1: Implement button logic and campaign status subscription**

**Step 2: Visual test**

- Host sees "Start Session" button, disabled when alone
- Another player joins → button becomes enabled
- Host clicks "Start Session" → both tabs redirect to game room
- Non-host player is automatically redirected when host starts

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: host start session button with realtime redirect"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| POST /api/campaign/[id]/session/start | Unit test (vitest) | 6 tests: auth, validation, success |
| Portrait generation trigger | Unit test (vitest) | 2 tests: with/without character name |
| Realtime player list | Visual/manual | Multi-tab test: join in one, see in other |
| Realtime campaign status | Visual/manual | Host starts → all clients redirect |
| Character portraits | Visual/manual | Placeholder → image transition |

---

## Acceptance Criteria

- [ ] Player list updates in real-time when new players join (no refresh needed)
- [ ] Character portraits generated via Gemini and displayed with placeholder → image transition
- [ ] `POST /api/campaign/[id]/session/start` validates host and creates session (6 tests passing)
- [ ] Portrait generation triggered on join when character details provided (2 tests passing)
- [ ] Host "Start Session" button works, disabled until players join
- [ ] All lobby clients redirect to game room when session starts
- [ ] `yarn build` succeeds
