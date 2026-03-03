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

No special headers — host is identified via Supabase auth session.

Behavior:
1. Get authenticated user via `createServerAuthClient().auth.getUser()` → 401 if missing
2. Fetch campaign by id → 404 if not found
3. Verify `user.id === campaign.host_user_id` → 403 if not the host
4. Validate campaign status is `lobby` or `paused` → 400 if already active
5. Create a new `sessions` row (`session_number` = existing session count + 1, `present_player_ids` = all active player ids)
6. Update campaign: `status = 'active'`, `current_session_id = new session id`
7. Return `{ session: { id, session_number } }` with status 200

Error responses:
- 401: not authenticated
- 404: campaign not found
- 403: not the host
- 400: campaign not in startable state

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerAuthClient: vi.fn(() => ({
    auth: { getUser: mockGetUser }
  })),
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom }))
}))

function makeRequest(campaignId: string) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/session/start`, {
    method: 'POST'
  })
}

describe('POST /api/campaign/[id]/session/start', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        })
      })
    })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'lobby', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(403)
  })

  it('returns 400 when campaign is already active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(400)
  })

  it('returns 200 and creates session on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    // campaign fetch
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'lobby', host_user_id: 'host-1' }, error: null }) }) })
    })
    // existing sessions count
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) })
    })
    // active players
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'p1' }, { id: 'p2' }], error: null }) }) })
    })
    // session insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'sess-1', session_number: 1 }, error: null }) }) })
    })
    // campaign update
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session.id).toBe('sess-1')
  })

  it('sets present_player_ids to all active player ids', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'lobby', host_user_id: 'host-1' }, error: null }) }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'p1' }, { id: 'p2' }], error: null }) }) }) })
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'sess-1', session_number: 1 }, error: null }) }) })
    mockFrom.mockReturnValueOnce({ insert: mockInsert })
    mockFrom.mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
    await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ present_player_ids: ['p1', 'p2'] })
    )
  })
})
```

**Step 2: Run tests — verify they fail**

```bash
yarn test app/api/campaign/\[id\]/session/start/__tests__/route
```

Expected: FAIL — `Cannot find module '../route'`

**Step 3: Implement `app/api/campaign/[id]/session/start/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerAuthClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = createServerAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const campaignId = params.id

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, status, host_user_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (campaign.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['lobby', 'paused'].includes(campaign.status)) {
    return NextResponse.json({ error: 'Campaign already active or ended' }, { status: 400 })
  }

  // Count existing sessions for session_number
  const { data: existingSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('campaign_id', campaignId)
  const sessionNumber = (existingSessions?.length ?? 0) + 1

  // Get active player ids
  const { data: activePlayers } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
  const presentPlayerIds = (activePlayers ?? []).map(p => p.id)

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({ campaign_id: campaignId, session_number: sessionNumber, present_player_ids: presentPlayerIds })
    .select()
    .single()
  if (sessionError) return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })

  await supabase
    .from('campaigns')
    .update({ status: 'active', current_session_id: session.id })
    .eq('id', campaignId)

  return NextResponse.json({ session }, { status: 200 })
}
```

**Step 4: Run tests — verify they pass**

```bash
yarn test app/api/campaign/\[id\]/session/start/__tests__/route
```

Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add app/api/campaign/\[id\]/session/start/
git commit -m "feat: POST /api/campaign/[id]/session/start with auth"
```

---

### Task 5: Wire Up Host "Start Session" Button

**Files:**
- Modify: `app/campaign/[id]/lobby/page.tsx`

**Spec:**

The "Start Session" button:
1. Only visible to the host (already determined in PR 07 via `campaign.host_user_id === currentUser.id`)
2. Disabled until at least 1 non-host player has joined
3. On click: POST to `/api/campaign/[id]/session/start` (no special headers — auth cookie sent automatically)
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
