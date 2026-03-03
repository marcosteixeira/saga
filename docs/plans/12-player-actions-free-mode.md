# PR 12: Player Actions + Free Mode Game Loop

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the free mode game loop: players submit actions, actions are broadcast to all players, and when all players have submitted (or timer expires), AI narration is triggered automatically.

**Architecture:** Player actions are submitted via API, saved to the messages table, and broadcast to all clients via Supabase Realtime. A turn tracker on the server counts submissions. When all active players have submitted (or the turn timer expires), the server triggers the narration endpoint. The client subscribes to action broadcasts to show other players' actions in real-time.

**Tech Stack:** Next.js API routes, Supabase Realtime (broadcast + Postgres changes), timer logic

**Depends on:** PR 10

---

## Design System Reference

All UI work in this PR must follow the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

**Applicable to this PR:**

- **Action submitted state:** After a player submits an action, show a brief mechanical "clunk" feedback on the submit button (tiny downward shift + shadow reduction, ~100ms), then disable it with `--gunmetal` bg. Show `"ACTION LOGGED"` in `Share Tech Mono` `--patina` as a transient chip near the input.
- **"Waiting for others" state:** ActionInput disabled, placeholder `"AWAITING FELLOW OPERATORS..."` in `Share Tech Mono` uppercase. The submitted action appears in the feed with a small `--ash` `[PENDING]` tag until narration triggers.
- **Turn timer (if applicable):** Display as a circular gauge or linear progress bar in `Share Tech Mono`. Color transitions: `--patina` (full) → `--amber` (< 30s) → `--furnace` (< 10s). Pulsing glow at low time.
- **Other players' actions appearing in realtime:** Animate in with the same steam burst + fade-in as the lobby join animation.

---

### Task 1: Build Message Submission API Route

**Files:**
- Create: `app/api/campaign/[id]/message/route.ts`
- Create: `app/api/campaign/[id]/message/__tests__/route.test.ts`

**Spec:**

`POST /api/campaign/[id]/message`

No special headers — player is identified via Supabase auth session (cookie).

Request body:
```json
{
  "content": "I cast fireball at the goblins",
  "type": "action"
}
```

Behavior:
1. Get authenticated user via `createServerAuthClient().auth.getUser()` → 401 if missing
2. Validate campaign exists and status is `active` → 404 / 400
3. Look up player by `campaign_id` + `user_id` → 403 if not found
4. Validate player status is `active` (not dead/incapacitated) → 400
5. Validate content is non-empty and type is `action` or `ooc` → 400
6. Check player hasn't already submitted this turn → 409
7. Save message to `messages` table with current `session_id`
8. Broadcast message via Supabase Realtime: `campaign:{id}:messages`
9. Return `{ message }` with status 201

Error responses:
- 401: not authenticated
- 404: campaign not found
- 400: campaign not active
- 403: player not in this campaign
- 400: player is dead/incapacitated
- 400: empty content or invalid type
- 409: player already submitted this turn

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockChannel = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerAuthClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
  createServerSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    channel: mockChannel,
  }))
}))

function makeRequest(campaignId: string, body = {}) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/message`, {
    method: 'POST',
    body: JSON.stringify({ content: 'I attack!', type: 'action', ...body }),
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('POST /api/campaign/[id]/message', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: {} }) }) }) })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when campaign is not active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'lobby', current_session_id: 's1' }, error: null }) }) }) })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(400)
  })

  it('returns 403 when player not in campaign', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }) }) }) })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: {} }) }) }) }) })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(403)
  })

  it('returns 400 when player is dead', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }) }) }) })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'p1', status: 'dead' }, error: null }) }) }) }) })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 when content is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }) }) }) })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'p1', status: 'active' }, error: null }) }) }) }) })
    const res = await POST(makeRequest('c1', { content: '' }), { params: { id: 'c1' } })
    expect(res.status).toBe(400)
  })

  it('returns 409 when player already submitted this turn', async () => {
    // ... setup campaign, active player, then turn tracker returns already submitted
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }) }) }) })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'p1', status: 'active' }, error: null }) }) }) }) })
    // existing message from this player this turn
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gt: vi.fn().mockResolvedValue({ data: [{ id: 'msg-existing' }], error: null }) }) }) }) }) }) })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(409)
  })

  it('returns 201 and saves message on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }) }) }) })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'p1', status: 'active' }, error: null }) }) }) }) })
    // no existing message
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gt: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }) }) })
    // insert message
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'msg-1', content: 'I attack!', type: 'action' }, error: null }) }) }) })
    mockChannel.mockReturnValue({ send: vi.fn().mockResolvedValue('ok') })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(201)
  })
})
```

**Step 2: Run tests — verify they fail**

```bash
yarn test app/api/campaign/\[id\]/message/__tests__/route
```

Expected: FAIL — `Cannot find module '../route'`

**Step 3: Implement `app/api/campaign/[id]/message/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerAuthClient, createServerSupabaseClient } from '@/lib/supabase/server'

const VALID_TYPES = ['action', 'ooc'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = createServerAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const campaignId = params.id
  const body = await request.json().catch(() => ({}))
  const { content, type } = body

  // 1. Validate campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, status, current_session_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'active') return NextResponse.json({ error: 'Campaign is not active' }, { status: 400 })

  // 2. Find player
  const { data: player } = await supabase
    .from('players')
    .select('id, status')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()
  if (!player) return NextResponse.json({ error: 'You are not in this campaign' }, { status: 403 })
  if (!['active', 'absent'].includes(player.status)) {
    return NextResponse.json({ error: 'Your character cannot act' }, { status: 400 })
  }

  // 3. Validate input
  if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  // 4. Check for duplicate submission this turn
  // "This turn" = since the last narration message in this session
  const { data: lastNarration } = await supabase
    .from('messages')
    .select('created_at')
    .eq('campaign_id', campaignId)
    .eq('session_id', campaign.current_session_id)
    .eq('type', 'narration')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const sinceTime = lastNarration?.created_at ?? new Date(0).toISOString()

  const { data: existingAction } = await supabase
    .from('messages')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('session_id', campaign.current_session_id)
    .eq('player_id', player.id)
    .eq('type', 'action')
    .gt('created_at', sinceTime)
  if (existingAction && existingAction.length > 0) {
    return NextResponse.json({ error: 'Already submitted this turn' }, { status: 409 })
  }

  // 5. Save message
  const { data: message, error: insertError } = await supabase
    .from('messages')
    .insert({
      campaign_id: campaignId,
      session_id: campaign.current_session_id,
      player_id: player.id,
      content: content.trim(),
      type,
    })
    .select()
    .single()
  if (insertError) return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })

  // 6. Broadcast via Realtime
  await supabase.channel(`campaign:${campaignId}:messages`).send({
    type: 'broadcast',
    event: 'new_message',
    payload: message,
  })

  return NextResponse.json({ message }, { status: 201 })
}
```

**Step 4: Run tests — verify they pass**

```bash
yarn test app/api/campaign/\[id\]/message/__tests__/route
```

Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add app/api/campaign/\[id\]/message/
git commit -m "feat: POST /api/campaign/[id]/message with Supabase auth"
```

---

### Task 2: Build Turn Tracker

**Files:**
- Create: `lib/turns.ts`
- Create: `lib/__tests__/turns.test.ts`

**Spec:**

```typescript
// Check if all active players have submitted actions since the last narration
checkAllPlayersSubmitted(campaignId: string, sessionId: string): Promise<{
  allSubmitted: boolean
  submitted: string[]     // player IDs who have submitted
  pending: string[]       // player IDs still pending
  total: number           // total active players
}>
```

Logic:
1. Get all active players for the campaign (status = `active`)
2. Get the last narration message (type = `narration`) in the current session
3. Get all action messages (type = `action`) since that last narration
4. Compare: if every active player has at least one action since the last narration, `allSubmitted = true`

```typescript
// Trigger narration if conditions are met (called after each action submission)
maybeTriggerNarration(campaignId: string, sessionId: string): Promise<boolean>
```

Logic:
1. Call `checkAllPlayersSubmitted()`
2. If `allSubmitted === true`: trigger narration (call the narrate endpoint internally), return `true`
3. If not: return `false`

**Step 1: Write tests**

```typescript
describe('checkAllPlayersSubmitted', () => {
  it('returns true when all active players have submitted', async () => {
    // 2 active players, 2 actions since last narration
  })

  it('returns false when some players have not submitted', async () => {
    // 2 active players, 1 action since last narration
  })

  it('ignores dead and incapacitated players', async () => {
    // 3 players total, 1 dead, 2 active — only 2 need to submit
  })

  it('ignores absent players with skip mode', async () => {
    // 2 active, 1 absent (skip) — only 2 need to submit
  })

  it('handles no narration yet (start of session)', async () => {
    // No narration messages — all actions count
  })
})

describe('maybeTriggerNarration', () => {
  it('triggers narration when all players have submitted', async () => {
    // Mock checkAllPlayersSubmitted returning true
    // Verify narration is triggered
  })

  it('does not trigger narration when players are pending', async () => {
    // Mock checkAllPlayersSubmitted returning false
    // Verify narration is NOT triggered
  })
})
```

7 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: turn tracker with auto-narration trigger"
```

---

### Task 3: Wire Turn Tracker into Message Submission

**Files:**
- Modify: `app/api/campaign/[id]/message/route.ts`

**Spec:**

After successfully saving a player's action, call `maybeTriggerNarration()`. If it returns `true`, narration will be triggered automatically.

This is fire-and-forget — the message route returns 201 immediately. The narration happens asynchronously.

**Step 1: Update tests**

```typescript
it('calls maybeTriggerNarration after saving action', async () => {
  // Verify maybeTriggerNarration is called with correct campaignId and sessionId
})
```

1 new test case.

**Step 2: Run test — fail**

**Step 3: Update implementation**

**Step 4: Run tests — all pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: auto-trigger narration after all players submit"
```

---

### Task 4: Build Turn Timer

**Files:**
- Create: `lib/turn-timer.ts`
- Create: `lib/__tests__/turn-timer.test.ts`

**Spec:**

Server-side timer that triggers narration when the turn time expires:

```typescript
// Start or reset the turn timer for a campaign
startTurnTimer(campaignId: string, sessionId: string, timerSeconds: number): void

// Cancel the timer (e.g., when all players submit before timer expires)
cancelTurnTimer(campaignId: string): void
```

Implementation approach: use an in-memory `Map<string, NodeJS.Timeout>` to track timers per campaign. When the timer fires, call `maybeTriggerNarration()`.

Note: this is a simple in-memory approach suitable for the MVP. In production, this would use a job queue. Since Vercel serverless functions are stateless, this timer only works if we have a long-running server or use an alternative approach (like Supabase scheduled functions).

**Alternative for Vercel**: Instead of server-side timers, implement client-side timers. The client tracks the countdown. When it expires, the client calls a "force-narrate" endpoint that triggers narration regardless of submission status.

Let's go with the **client-side timer** approach for Vercel compatibility.

```typescript
// Client-side hook
useTurnTimer(campaignId: string, timerSeconds: number, onExpire: () => void): {
  timeRemaining: number
  isActive: boolean
  reset: () => void
}
```

**Step 1: Write tests**

```typescript
describe('useTurnTimer', () => {
  it('counts down from timerSeconds', () => {
    // Use fake timers
  })

  it('calls onExpire when timer reaches 0', () => {
    // Use fake timers, advance to 0
  })

  it('reset restarts the countdown', () => {
    // Call reset, verify timer starts over
  })
})
```

3 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

Use `useEffect` + `setInterval`. Reset when narration is received.

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: client-side turn timer with auto-expire"
```

---

### Task 5: Build TurnIndicator Component and Wire ActionInput

**Files:**
- Create: `components/game/TurnIndicator.tsx`
- Modify: `components/game/ActionInput.tsx`
- Modify: `components/game/GameRoom.tsx`

**Spec:**

`TurnIndicator` shows:
- Timer countdown bar (full width, shrinks as time runs out)
- Color: gold → orange → red as time decreases
- Text: "X/Y players have acted" (e.g., "1/3 players have acted")
- When all players have submitted: "Waiting for the Game Master..."

Update `ActionInput`:
- Disable input while narration is streaming
- Show "Waiting for the Game Master..." while AI is narrating
- After narration completes, re-enable input and reset timer
- On submit: call `POST /api/campaign/[id]/message` with session token

Update `GameRoom`:
- Subscribe to message broadcasts (`campaign:{id}:messages`)
- When action message received: add to message list, update turn indicator count
- When narration completes: reset timer, re-enable input

**Step 1: Implement TurnIndicator**

Visual component with timer bar and player count.

**Step 2: Wire ActionInput to submit actions via API**

**Step 3: Wire GameRoom to subscribe to action broadcasts**

**Step 4: Visual test (requires full stack running)**

- Player submits action → action appears in MessageFeed
- Other players see the action in real-time
- Turn indicator shows "1/3 players have acted"
- All players submit → "Waiting for the Game Master..." → AI narrates
- Timer bar counts down, turns red near end
- Timer expires → narration triggered even if not all players submitted

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: turn indicator, action submission, and full free mode game loop"
```

---

### Task 6: Opening Narration (Start of Session)

**Files:**
- Modify: `app/api/campaign/[id]/session/start/route.ts`

**Spec:**

When the host starts a session, automatically trigger the opening narration:

1. After creating the session and updating campaign status (existing logic)
2. Trigger narration with no player actions (empty messages array)
3. The GM system prompt includes the world description and character info — Claude generates an opening scene

**Step 1: Update session start tests**

```typescript
it('triggers opening narration after session starts', async () => {
  // Verify narrate endpoint is called after session creation
})
```

1 new test case.

**Step 2: Run test — fail**

**Step 3: Update implementation**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: opening narration when session starts"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| POST /api/campaign/[id]/message | Unit test (vitest) | 9 tests: all error paths + success + broadcast |
| Turn tracker (checkAllPlayersSubmitted) | Unit test (vitest) | 5 tests: all/partial/dead/absent/no-narration |
| maybeTriggerNarration | Unit test (vitest) | 2 tests: trigger/no-trigger |
| useTurnTimer | Unit test (vitest) | 3 tests: countdown, expire, reset |
| Auto-trigger after message | Unit test (vitest) | 1 test |
| Opening narration | Unit test (vitest) | 1 test |
| Full game loop | Manual | Submit actions → timer → narration → repeat |
| Realtime action broadcast | Manual | Multi-tab: submit in one, see in other |

---

## Acceptance Criteria

- [ ] `POST /api/campaign/[id]/message` validates and saves player actions (9 tests passing)
- [ ] Turn tracker correctly identifies when all active players have submitted (7 tests passing)
- [ ] Narration auto-triggers when all players submit
- [ ] Client-side turn timer counts down and triggers narration on expire (3 tests passing)
- [ ] TurnIndicator shows timer bar and player submission count
- [ ] ActionInput disabled during narration, re-enabled after
- [ ] Actions broadcast to all connected clients in real-time
- [ ] Opening narration fires when session starts (1 test passing)
- [ ] Full free mode loop works: actions → narration → actions → ...
- [ ] `yarn build` succeeds
