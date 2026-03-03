# PR 13: Session Management + Summary

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement session end flow: host ends the session, Claude generates a narrative summary, summary is displayed on a dedicated page, and the campaign transitions to paused/ended status.

**Architecture:** The host triggers session end via API. The server calls Claude to generate a prose summary from all session messages. The summary is saved to the sessions table and as a session-XX.md campaign file. MEMORY.md is compacted for the next session. The summary page displays the narrative and offers options to continue or end the campaign.

**Tech Stack:** Claude Sonnet 4.6 (summary generation), Supabase, Next.js

**Depends on:** PR 12

---

## Design System Reference

All UI work in this PR must follow the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

**Applicable to this PR:**

- **Session summary page (`/campaign/[id]/summary`):** Full layered background. Session title in `Pragati Narrow` display size, uppercase, `--brass` glow. Summary prose in `Rokkitt`, `--steam`, generous line-height. Wrap in an Iron Plate panel with rivet corners.
- **"Continue Campaign" / "End Campaign" buttons:** Continue → Primary (`--brass`, chamfered). End → Destructive (rusted red, chamfered, hover ember burst).
- **"End Session" host control:** Displayed as a Secondary button (`--gunmetal` bg, `--copper` border) in the game room. Confirm dialog styled as a Copper Gauge Panel with a destructive confirm button.
- **Session transition overlay:** When session ends, show a steam burst + fade-to-black before routing to the summary page.

---

### Task 1: Build Session Summary Prompt

**Files:**
- Create: `lib/prompts/session-summary.ts`
- Create: `lib/prompts/__tests__/session-summary.test.ts`

**Spec:**

```typescript
buildSessionSummaryPrompt(messages: Message[], players: Player[]): string
```

Instructs Claude to write a 400-600 word narrative prose summary:
- Past tense, third person
- Cover key events, player actions, NPC interactions, combat outcomes
- Mention all player characters by name
- Dramatic, story-like tone
- No game mechanics in the summary (no "rolled a 15")

**Step 1: Write tests**

```typescript
describe('buildSessionSummaryPrompt', () => {
  it('includes all player character names in the prompt', () => {
    const players = [
      { character_name: 'Gandalf' } as Player,
      { character_name: 'Aragorn' } as Player,
    ]
    const result = buildSessionSummaryPrompt([], players)
    expect(result).toContain('Gandalf')
    expect(result).toContain('Aragorn')
  })

  it('includes message content for context', () => {
    const messages = [
      { content: 'The dragon breathes fire', type: 'narration' } as Message,
      { content: 'I dodge the flames', type: 'action' } as Message,
    ]
    const result = buildSessionSummaryPrompt(messages, [])
    expect(result).toContain('The dragon breathes fire')
    expect(result).toContain('I dodge the flames')
  })

  it('specifies 400-600 word prose format', () => {
    const result = buildSessionSummaryPrompt([], [])
    expect(result).toMatch(/400.*600|prose|narrative/i)
  })
})
```

3 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: session summary prompt builder"
```

---

### Task 2: Build End Session API Route

**Files:**
- Create: `app/api/campaign/[id]/session/end/route.ts`
- Create: `app/api/campaign/[id]/session/end/__tests__/route.test.ts`

**Spec:**

`POST /api/campaign/[id]/session/end`

No special headers — host identified via Supabase auth session.

Behavior:
1. Get authenticated user via `createServerAuthClient().auth.getUser()` → 401 if missing
2. Validate campaign exists and status is `active` → 404 / 400
3. Verify `user.id === campaign.host_user_id` → 403 if not the host
3. Fetch all messages for the current session
4. Call Claude to generate session summary
5. Update session row: `ended_at = now()`, `summary_md = summary`
6. Save summary as `session-{XX}.md` in campaign_files
7. Compact MEMORY.md (Claude rewrites it to include the just-ended session's key events)
8. Update campaign: `status = 'paused'`, `current_session_id = null`
9. Broadcast status change so all clients know the session ended
10. Return `{ summary: summaryText }` with status 200

Error responses:
- 404: campaign not found
- 403: not the host
- 400: campaign is not active

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerAuthClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom, channel: vi.fn().mockReturnValue({ send: vi.fn() }) }))
}))
vi.mock('@/lib/anthropic', () => ({
  anthropic: { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Session summary...' }] }) } }
}))
vi.mock('@/lib/memory', () => ({
  upsertCampaignFile: vi.fn().mockResolvedValue(undefined)
}))

function makeRequest(campaignId: string) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/session/end`, { method: 'POST' })
}

describe('POST /api/campaign/[id]/session/end', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: {} }) }) }) })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(404)
  })

  it('returns 403 when not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } } })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', host_user_id: 'host-1', current_session_id: 's1' }, error: null }) }) }) })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(403)
  })

  it('returns 400 when campaign is not active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'paused', host_user_id: 'host-1', current_session_id: 's1' }, error: null }) }) }) })
    const res = await POST(makeRequest('c1'), { params: { id: 'c1' } })
    expect(res.status).toBe(400)
  })

  it('generates session summary via Claude', async () => {
    // ... full success mock setup
    // verify anthropic.messages.create is called
  })

  it('updates campaign status to paused on success', async () => {
    // ... verify campaign update called with status='paused'
  })

  it('returns 200 with summary text on success', async () => {
    // ... verify status 200 and body.summary is present
  })
})
```

7 test cases.

**Step 2: Run tests — verify they fail**

```bash
yarn test app/api/campaign/\[id\]/session/end/__tests__/route
```

Expected: FAIL — `Cannot find module '../route'`

**Step 3: Implement `app/api/campaign/[id]/session/end/route.ts`**

Key implementation logic:
```typescript
import { createServerAuthClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/anthropic'
import { buildSessionSummaryPrompt } from '@/lib/prompts/session-summary'
import { upsertCampaignFile } from '@/lib/memory'

export async function POST(request, { params }) {
  const { data: { user } } = await createServerAuthClient().auth.getUser()
  if (!user) return 401

  // fetch campaign, check host_user_id, check status...

  // fetch session messages
  const { data: messages } = await supabase.from('messages')
    .select('*').eq('session_id', currentSessionId).order('created_at')

  // generate summary
  const summary = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildSessionSummaryPrompt(messages) }]
  })
  const summaryText = summary.content.filter(b => b.type === 'text').map(b => b.text).join('')

  // save to session row + campaign files
  await supabase.from('sessions').update({ summary_md: summaryText, ended_at: new Date() }).eq('id', currentSessionId)
  await upsertCampaignFile(campaignId, `session-${sessionNumber}.md`, summaryText)

  // update campaign
  await supabase.from('campaigns').update({ status: 'paused', current_session_id: null }).eq('id', campaignId)

  return 200, { summary: summaryText }
}
```

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: POST /api/campaign/[id]/session/end with summary"
```

---

### Task 3: Build Session Summary Page

**Files:**
- Modify: `app/campaign/[id]/summary/page.tsx`

**Spec:**

Displays after a session ends:
- Session title: "Session {number} Summary"
- Campaign name as subtitle
- Session summary prose in serif font, parchment color
- Cover image as background/header if available
- Two buttons:
  - "Continue Campaign" (visible to host): sets campaign status back to `paused` and redirects to lobby
  - "End Campaign" (visible to host): sets campaign status to `ended`
  - Non-host: "Waiting for the host to decide..."

Data loading:
- Fetch campaign + current (or most recent) session from API
- Display session's `summary_md`

**Step 1: Implement the summary page**

**Step 2: Visual test**

- Visit `/campaign/[id]/summary` after ending a session
- Summary prose renders beautifully in dark fantasy theme
- Host sees both buttons
- Non-host sees waiting message
- "Continue Campaign" redirects to lobby

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: session summary page with continue/end options"
```

---

### Task 4: Add Host Controls to Game Room

**Files:**
- Modify: `components/game/GameRoom.tsx`

**Spec:**

Add host-only controls to the game room:
- "End Session" button in the sidebar or header (only visible to host)
- Confirmation dialog: "Are you sure? This will generate a session summary and pause the campaign."
- On confirm: POST to `/api/campaign/[id]/session/end`
- On success: redirect all clients to `/campaign/[id]/summary`

Use Supabase Realtime (campaign status subscription from PR 07) to detect when the campaign status changes to `paused` and redirect all clients.

**Step 1: Add shadcn dialog component**

Run: `npx shadcn@latest add dialog`

**Step 2: Implement "End Session" button with confirmation**

**Step 3: Visual test**

- Host sees "End Session" button
- Non-host does not see it
- Click → confirmation dialog
- Confirm → loading → redirect to summary page
- All connected clients redirected

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: host end session control with confirmation"
```

---

### Task 5: Campaign Status Transitions

**Files:**
- Create: `app/api/campaign/[id]/status/route.ts` (or add to existing route)
- Create: `app/api/campaign/[id]/status/__tests__/route.test.ts`

**Spec:**

`PATCH /api/campaign/[id]/status`

No special headers — host identified via Supabase auth session.

Request body:
```json
{
  "status": "ended"
}
```

Allowed transitions:
- `paused` → `ended` (host ends the campaign permanently)
- Only the host can change status via this route

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerAuthClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom }))
}))

function makeRequest(campaignId: string, body = {}) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('PATCH /api/campaign/[id]/status', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest('c1', { status: 'ended' }), { params: { id: 'c1' } })
    expect(res.status).toBe(401)
  })

  it('returns 403 when not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other' } } })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'paused', host_user_id: 'host-1' }, error: null }) }) }) })
    const res = await PATCH(makeRequest('c1', { status: 'ended' }), { params: { id: 'c1' } })
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid status transition', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', host_user_id: 'host-1' }, error: null }) }) }) })
    // active → ended is not allowed (only paused → ended)
    const res = await PATCH(makeRequest('c1', { status: 'ended' }), { params: { id: 'c1' } })
    expect(res.status).toBe(400)
  })

  it('updates status on valid paused → ended transition', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'paused', host_user_id: 'host-1' }, error: null }) }) }) })
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockFrom.mockReturnValueOnce({ update: mockUpdate })
    const res = await PATCH(makeRequest('c1', { status: 'ended' }), { params: { id: 'c1' } })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'ended' })
  })
})
```

4 test cases.

**Step 2: Run tests — verify they fail**

```bash
yarn test app/api/campaign/\[id\]/status/__tests__/route
```

Expected: FAIL — `Cannot find module '../route'`

**Step 3: Implement**

Simple route: get user, fetch campaign, check host, validate transition, update.

**Step 4: Run tests — verify they pass**

```bash
yarn test app/api/campaign/\[id\]/status/__tests__/route
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add app/api/campaign/\[id\]/status/
git commit -m "feat: campaign status transitions via PATCH with auth"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| buildSessionSummaryPrompt | Unit test (vitest) | 3 tests |
| POST /api/campaign/[id]/session/end | Unit test (vitest) | 7 tests: auth, validation, summary gen, DB updates |
| PATCH /api/campaign/[id]/status | Unit test (vitest) | 3 tests: auth, invalid transition, success |
| Summary page | Visual/manual | Prose display, host controls, non-host view |
| End session flow | Manual | Host ends → summary generated → all clients redirect |
| Campaign lifecycle | Manual | lobby → active → paused → active → paused → ended |

---

## Acceptance Criteria

- [ ] Session summary prompt builder includes players and messages (3 tests passing)
- [ ] End session route generates summary, saves to DB, pauses campaign (7 tests passing)
- [ ] Status transition route validates host and transitions (3 tests passing)
- [ ] Summary page displays prose narrative with dark fantasy styling
- [ ] Host can continue or end campaign from summary page
- [ ] "End Session" button in game room with confirmation dialog
- [ ] All clients redirected when session ends
- [ ] Full lifecycle: lobby → active → paused → summary works
- [ ] `yarn build` succeeds
