# Start Campaign Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the host clicks "Start Game", broadcast `game:starting` to redirect all players to the game route, then async-generate the opening session content (situation, hooks, scene image) and broadcast `game:started` when ready.

**Architecture:** `POST /api/campaign/[id]/start` does sync work (validate → update campaign status → broadcast `game:starting` → return 200), then fires an async block that creates the session, calls Claude for opening content, broadcasts `game:started`, then calls a new Supabase Edge Function to generate and store the scene image. `LobbyClient.tsx` subscribes to `game:starting` and redirects all clients (including the host) to `/campaign/[id]/game`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (DB + Storage + Realtime Broadcast), Anthropic Claude SDK (`lib/anthropic.ts`), Gemini via new Edge Function (Deno), Vitest for unit tests.

---

### Task 1: DB Migration — add opening content columns to sessions

**Files:**
- Create: `supabase/migrations/007_session_opening_content.sql`

**Step 1: Write the migration**

```sql
alter table sessions
  add column if not exists opening_situation text,
  add column if not exists starting_hooks    jsonb,
  add column if not exists scene_image_url   text;
```

**Step 2: Apply it locally**

```bash
npx supabase db push
```

Expected: migration applies with no errors.

**Step 3: Commit**

```bash
git add supabase/migrations/007_session_opening_content.sql
git commit -m "feat: add opening_situation, starting_hooks, scene_image_url to sessions"
```

---

### Task 2: Update Session type

**Files:**
- Modify: `types/session.ts`

**Step 1: Add the new fields**

Open `types/session.ts`. The current `Session` type ends at `ended_at`. Add three fields:

```ts
export type Session = {
  id: string
  campaign_id: string
  session_number: number
  present_player_ids: string[]
  summary_md: string | null
  opening_situation: string | null   // ← add
  starting_hooks: unknown | null     // ← add (jsonb maps to unknown; cast at callsite)
  scene_image_url: string | null     // ← add
  started_at: string
  ended_at: string | null
}
```

**Step 2: Commit**

```bash
git add types/session.ts
git commit -m "feat: add opening content fields to Session type"
```

---

### Task 3: Create `lib/realtime-broadcast.ts`

This helper sends a fire-and-forget broadcast to a Supabase Realtime channel from Node.js API routes. The `generate-image` edge function and the upcoming lobby-realtime branch both use the same pattern — this is the Node.js version.

**Files:**
- Create: `lib/realtime-broadcast.ts`
- Create: `lib/__tests__/realtime-broadcast.test.ts`

**Step 1: Write the failing test**

```ts
// lib/__tests__/realtime-broadcast.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('broadcastCampaignEvent', () => {
  it('POSTs to the Supabase realtime broadcast endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const { broadcastCampaignEvent } = await import('../realtime-broadcast')
    await broadcastCampaignEvent('campaign-1', 'game:starting', {})
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.supabase.co/realtime/v1/api/broadcast',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'test-service-role-key',
          Authorization: 'Bearer test-service-role-key',
        }),
      })
    )
  })

  it('sends the correct channel and event in the body', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const { broadcastCampaignEvent } = await import('../realtime-broadcast')
    await broadcastCampaignEvent('campaign-42', 'game:started', { session_id: 'sess-1' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0].topic).toBe('campaign:campaign-42')
    expect(body.messages[0].event).toBe('game:started')
    expect(body.messages[0].payload).toEqual({ session_id: 'sess-1' })
  })

  it('swallows errors silently', async () => {
    fetchMock.mockRejectedValue(new Error('network error'))
    const { broadcastCampaignEvent } = await import('../realtime-broadcast')
    await expect(broadcastCampaignEvent('campaign-1', 'game:starting', {})).resolves.toBeUndefined()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/marcosteixeira/Dev/saga/.worktrees/feat/start-campaign-action
yarn test lib/__tests__/realtime-broadcast.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

```ts
// lib/realtime-broadcast.ts
export async function broadcastCampaignEvent(
  campaignId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `campaign:${campaignId}`, event, payload }],
      }),
    })
  } catch {
    // fire-and-forget — swallow errors
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test lib/__tests__/realtime-broadcast.test.ts
```

Expected: 3 passing.

**Step 5: Commit**

```bash
git add lib/realtime-broadcast.ts lib/__tests__/realtime-broadcast.test.ts
git commit -m "feat: add broadcastCampaignEvent helper for Realtime Broadcast"
```

---

### Task 4: Create `POST /api/campaign/[id]/start` — sync part

This task covers only the synchronous part of the route: auth check, validation, campaign status update, broadcast `game:starting`, return 200. The async part is Task 5.

**Files:**
- Create: `app/api/campaign/[id]/start/route.ts`
- Create: `app/api/campaign/[id]/start/__tests__/route.test.ts`

**Step 1: Write the failing tests**

```ts
// app/api/campaign/[id]/start/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastCampaignEvent: vi.fn().mockResolvedValue(undefined),
}))

import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'
import { broadcastCampaignEvent } from '@/lib/realtime-broadcast'
import { POST } from '../route'

const mockHostUser = { id: 'host-user-id' }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest() {
  return new Request('http://localhost/api/campaign/abc/start', { method: 'POST' })
}

function makeSupabaseWithCampaignAndPlayers(
  campaign: Record<string, unknown> | null,
  players: Record<string, unknown>[],
  campaignError: Record<string, unknown> | null = null,
  updateError: Record<string, unknown> | null = null,
) {
  const mockSingle = vi.fn().mockResolvedValue({ data: campaign, error: campaignError })
  const mockDb: Record<string, unknown> = {
    from: vi.fn((table: string) => {
      if (table === 'campaigns') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: updateError }),
          }),
          single: mockSingle,
        }
      }
      if (table === 'players') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: players, error: null }),
            // for simple eq chain used in fetching players by campaign_id only
            data: players,
            error: null,
          }),
        }
      }
      return {}
    }),
  }
  return mockDb
}

describe('POST /api/campaign/[id]/start', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not the host', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'not-the-host' } } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when not all players are ready', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby' }
    const players = [
      { id: 'p1', is_ready: true },
      { id: 'p2', is_ready: false },
    ]
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'campaigns') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: players, error: null }),
        }
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not ready/i)
  })

  it('returns 200, updates campaign to active, and broadcasts game:starting when all ready', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby', world_id: 'world-1' }
    const players = [
      { id: 'p1', is_ready: true, character_name: 'Arwen', character_class: 'Mage', character_backstory: null },
    ]
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'campaigns') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          update: updateFn,
        }
        if (table === 'players') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: players, error: null }),
        }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { world_content: 'World lore...', name: 'Eldoria' }, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(200)
    expect(updateFn).toHaveBeenCalledWith({ status: 'active' })
    expect(broadcastCampaignEvent).toHaveBeenCalledWith('abc', 'game:starting', {})
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test app/api/campaign/[id]/start/__tests__/route.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the sync-only route implementation**

```ts
// app/api/campaign/[id]/start/route.ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'
import { broadcastCampaignEvent } from '@/lib/realtime-broadcast'
import { anthropic } from '@/lib/anthropic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  // ── Fetch campaign ───────────────────────────────────────────────────────────
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, host_user_id, status, world_id')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // ── Host guard ───────────────────────────────────────────────────────────────
  if (campaign.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Only the host can start the campaign' }, { status: 403 })
  }

  // ── Validate all players ready ───────────────────────────────────────────────
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, is_ready, character_name, character_class, character_backstory, username')
    .eq('campaign_id', campaignId)

  if (playersError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const notReady = (players ?? []).filter((p) => !p.is_ready)
  if (notReady.length > 0) {
    return NextResponse.json({ error: 'Not all players are ready' }, { status: 400 })
  }

  // ── Update campaign status ───────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ status: 'active' })
    .eq('id', campaignId)

  if (updateError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // ── Broadcast game:starting (sync — triggers redirect on all clients) ─────────
  await broadcastCampaignEvent(campaignId, 'game:starting', {})

  // ── Async: generate session content (fire-and-forget) ───────────────────────
  generateSessionContent(campaignId, campaign.world_id, players ?? []).catch((err) => {
    console.error('[start-campaign] async generation failed:', err)
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}

// Defined below in Task 5
async function generateSessionContent(
  campaignId: string,
  worldId: string,
  players: Array<{
    id: string
    character_name: string | null
    character_class: string | null
    character_backstory: string | null
    username: string
  }>
): Promise<void> {
  // stub — implementation added in Task 5
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test app/api/campaign/[id]/start/__tests__/route.test.ts
```

Expected: 5 passing.

**Step 5: Commit**

```bash
git add app/api/campaign/[id]/start/route.ts app/api/campaign/[id]/start/__tests__/route.test.ts
git commit -m "feat: add POST /api/campaign/[id]/start sync part"
```

---

### Task 5: Add async generation to the start route

Fill in `generateSessionContent` — creates session, calls Claude, saves results, broadcasts `game:started`.

**Files:**
- Modify: `app/api/campaign/[id]/start/route.ts`
- Modify: `app/api/campaign/[id]/start/__tests__/route.test.ts`

**Step 1: Write the failing tests**

Add these tests to the existing `describe` block in `__tests__/route.test.ts`:

```ts
// Add to existing test file — these test the exported generateSessionContent function
// To test it, we need to export it. See Step 3.

import { generateSessionContent } from '../route'

vi.mock('@/lib/anthropic', () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
}))

import { anthropic } from '@/lib/anthropic'

describe('generateSessionContent', () => {
  beforeEach(() => vi.clearAllMocks())

  const players = [
    { id: 'p1', character_name: 'Arwen', character_class: 'Mage', character_backstory: 'A wanderer', username: 'alice' },
  ]

  it('creates a session row with session_number 1 and present_player_ids', async () => {
    const insertSingle = vi.fn().mockResolvedValue({
      data: { id: 'session-1' }, error: null,
    })
    const sessionInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: insertSingle,
    })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const sessionUpdate = vi.fn().mockReturnValue({ eq: updateEq })

    ;(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        opening_situation: 'You stand at the gates.',
        starting_hooks: ['Hook A', 'Hook B'],
      }) }],
    })

    const worldSingle = vi.fn().mockResolvedValue({
      data: { world_content: 'World lore...', name: 'Eldoria' }, error: null,
    })

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'sessions') return { insert: sessionInsert, update: sessionUpdate }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: worldSingle,
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)

    await generateSessionContent('campaign-1', 'world-1', players)

    expect(sessionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_id: 'campaign-1',
        session_number: 1,
        present_player_ids: ['p1'],
      })
    )
  })

  it('calls Claude with world content and player info', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: insertSingle }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { world_content: 'World lore here', name: 'Eldoria' }, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    ;(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        opening_situation: 'You stand at the gates.',
        starting_hooks: ['Hook A'],
      }) }],
    })

    await generateSessionContent('campaign-1', 'world-1', players)

    const call = (anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const userMsg = call.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('World lore here')
    expect(userMsg.content).toContain('Arwen')
    expect(userMsg.content).toContain('Mage')
  })

  it('saves opening_situation and starting_hooks to session row', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: insertSingle }),
          update: updateFn,
        }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { world_content: 'Lore', name: 'World' }, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    ;(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        opening_situation: 'You stand at the gates.',
        starting_hooks: ['Investigate the noise', 'Follow the stranger'],
      }) }],
    })

    await generateSessionContent('campaign-1', 'world-1', players)

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        opening_situation: 'You stand at the gates.',
        starting_hooks: ['Investigate the noise', 'Follow the stranger'],
      })
    )
  })

  it('broadcasts game:started with session_id and opening content', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'session-42' }, error: null })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: insertSingle }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { world_content: 'Lore', name: 'World' }, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    ;(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        opening_situation: 'The city burns.',
        starting_hooks: ['Flee', 'Fight'],
      }) }],
    })

    await generateSessionContent('campaign-1', 'world-1', players)

    expect(broadcastCampaignEvent).toHaveBeenCalledWith(
      'campaign-1',
      'game:started',
      expect.objectContaining({
        session_id: 'session-42',
        opening_situation: 'The city burns.',
        starting_hooks: ['Flee', 'Fight'],
      })
    )
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test app/api/campaign/[id]/start/__tests__/route.test.ts
```

Expected: new tests FAIL — `generateSessionContent` not exported.

**Step 3: Implement `generateSessionContent` and export it**

Replace the stub at the bottom of `app/api/campaign/[id]/start/route.ts`:

```ts
export async function generateSessionContent(
  campaignId: string,
  worldId: string,
  players: Array<{
    id: string
    character_name: string | null
    character_class: string | null
    character_backstory: string | null
    username: string
  }>
): Promise<void> {
  const supabase = createServerSupabaseClient()

  // 1. Fetch world content
  const { data: world, error: worldError } = await supabase
    .from('worlds')
    .select('name, world_content')
    .eq('id', worldId)
    .single()

  if (worldError || !world?.world_content) {
    throw new Error(`[start-campaign] world content not found for world ${worldId}`)
  }

  // 2. Create session row
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      campaign_id: campaignId,
      session_number: 1,
      present_player_ids: players.map((p) => p.id),
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`[start-campaign] failed to create session: ${sessionError?.message}`)
  }

  // 3. Build player summary for prompt
  const playerList = players
    .map((p) => {
      const backstory = p.character_backstory ? ` Backstory: ${p.character_backstory}` : ''
      return `- ${p.character_name ?? p.username} (${p.character_class ?? 'unknown class'})${backstory}`
    })
    .join('\n')

  const userPrompt = `World: ${world.name}

${world.world_content}

Party members:
${playerList}

Generate the opening scene for this adventure. Return valid JSON only — no markdown, no explanation:
{
  "opening_situation": "<3-5 sentence narrative paragraph describing where the party finds themselves: setting, atmosphere, what is immediately happening>",
  "starting_hooks": ["<hook 1>", "<hook 2>", "<hook 3>"]
}`

  // 4. Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? ''
  const parsed = JSON.parse(text) as {
    opening_situation: string
    starting_hooks: string[]
  }

  // 5. Save to session
  await supabase
    .from('sessions')
    .update({
      opening_situation: parsed.opening_situation,
      starting_hooks: parsed.starting_hooks,
    })
    .eq('id', session.id)

  // 6. Broadcast game:started
  await broadcastCampaignEvent(campaignId, 'game:started', {
    session_id: session.id,
    opening_situation: parsed.opening_situation,
    starting_hooks: parsed.starting_hooks,
  })

  // 7. Fire-and-forget scene image generation (Task 6)
  triggerSceneImageGeneration(campaignId, session.id, world.name, world.world_content, playerList)
    .catch((err) => console.error('[start-campaign] scene image generation failed:', err))
}

// Stub — implementation added in Task 6
async function triggerSceneImageGeneration(
  _campaignId: string,
  _sessionId: string,
  _worldName: string,
  _worldContent: string,
  _playerList: string,
): Promise<void> {}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test app/api/campaign/[id]/start/__tests__/route.test.ts
```

Expected: all tests passing.

**Step 5: Commit**

```bash
git add app/api/campaign/[id]/start/route.ts app/api/campaign/[id]/start/__tests__/route.test.ts
git commit -m "feat: add async session generation to start campaign route"
```

---

### Task 6: Scene image generation via Edge Function

Create a new `generate-scene-image` Supabase Edge Function and wire it into the start route.

**Files:**
- Create: `supabase/functions/generate-scene-image/index.ts`
- Modify: `app/api/campaign/[id]/start/route.ts` (fill `triggerSceneImageGeneration`)

**Step 1: Write the edge function**

The function receives `{ session_id, campaign_id, world_name, world_content, player_list }`, generates an image via Gemini, uploads to storage as `sessions/<session_id>/scene.png`, updates `sessions.scene_image_url`, and is fire-and-forget (caller doesn't await).

```ts
// supabase/functions/generate-scene-image/index.ts
type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data: string; mimeType: string }
        text?: string
      }>
    }
  }>
}

const IMAGE_SYSTEM_PROMPT = `You are a tabletop RPG scene artist. Generate a single widescreen (16:9 landscape) cinematic scene showing a group of adventurers in the described setting.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich atmospheric scene content — no large empty or black areas
- The scene should extend edge-to-edge with interesting environmental details
- Show the party of adventurers as silhouettes or mid-ground figures
- Add a subtle dark vignette along the bottom edge for UI text readability

VISUAL RULES:
- Do NOT include any text, titles, logos, or labels anywhere in the image
- Use deep, rich atmospheric lighting with dramatic shadows
- Genre must be faithfully rendered from the world description

Output only the image.`

export function extractImageBytes(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data
  }
  throw new Error('No image data returned from Gemini')
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get('GENERATE_SCENE_IMAGE_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { session_id?: string; campaign_id?: string; world_name?: string; world_content?: string; player_list?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { session_id, campaign_id, world_name, world_content, player_list } = body
  if (!session_id || !campaign_id || !world_content) {
    return new Response('Missing required fields', { status: 400 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('jsr:@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const userPrompt = `World: ${world_name ?? 'Unknown'}

${world_content}

Party:
${player_list ?? 'A group of adventurers'}`

    const { GoogleGenerativeAI } = await import('npm:@google/generative-ai')
    const genai = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!)
    const model = genai.getGenerativeModel({
      model: 'gemini-3-pro-image-preview',
      systemInstruction: IMAGE_SYSTEM_PROMPT,
    })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        // @ts-ignore
        responseModalities: ['IMAGE'],
      },
    })

    const base64Data = extractImageBytes(result.response as GeminiResponse)
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const storagePath = `sessions/${session_id}/scene.png`

    const { error: uploadError } = await supabase.storage
      .from('campaign-images')
      .upload(storagePath, imageBytes, { contentType: 'image/png', upsert: true })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from('campaign-images')
      .getPublicUrl(storagePath)

    await supabase
      .from('sessions')
      .update({ scene_image_url: urlData.publicUrl })
      .eq('id', session_id)

    return new Response(JSON.stringify({ ok: true, url: urlData.publicUrl }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generate-scene-image] failed', err)
    return new Response('Image generation failed', { status: 500 })
  }
})
```

**Step 2: Wire it into the route**

Replace the `triggerSceneImageGeneration` stub in `app/api/campaign/[id]/start/route.ts`:

```ts
async function triggerSceneImageGeneration(
  campaignId: string,
  sessionId: string,
  worldName: string,
  worldContent: string,
  playerList: string,
): Promise<void> {
  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-scene-image`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.GENERATE_SCENE_IMAGE_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.GENERATE_SCENE_IMAGE_WEBHOOK_SECRET}`
  }

  await fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id: sessionId,
      campaign_id: campaignId,
      world_name: worldName,
      world_content: worldContent,
      player_list: playerList,
    }),
  })
}
```

**Step 3: Deploy the edge function**

```bash
npx supabase functions deploy generate-scene-image
```

Set the secret in Supabase dashboard (or via CLI):
```bash
npx supabase secrets set GENERATE_SCENE_IMAGE_WEBHOOK_SECRET=<your-secret>
```

**Step 4: Run all tests to confirm nothing broken**

```bash
yarn test
```

Expected: all existing + new tests passing.

**Step 5: Commit**

```bash
git add supabase/functions/generate-scene-image/index.ts app/api/campaign/[id]/start/route.ts
git commit -m "feat: add generate-scene-image edge function and wire into start route"
```

---

### Task 7: Wire up the Lobby — Start Game button + game:starting redirect

**Files:**
- Modify: `app/campaign/[id]/lobby/LobbyClient.tsx`

**Step 1: Add `useRouter` and `useEffect` imports**

At the top of `LobbyClient.tsx`, add to the existing React import:

```ts
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
```

**Step 2: Add router and starting state inside the component**

Inside `LobbyClient` (after the existing state declarations), add:

```ts
const router = useRouter();
const [starting, setStarting] = useState(false);
const [startError, setStartError] = useState<string | null>(null);
```

**Step 3: Add the `handleStartGame` function**

```ts
async function handleStartGame() {
  setStarting(true);
  setStartError(null);
  try {
    const res = await fetch(`/api/campaign/${campaign.id}/start`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      setStartError(data.error ?? 'Failed to start game');
      setStarting(false);
    }
    // On success: do nothing — redirect happens via game:starting broadcast
  } catch {
    setStartError('Failed to start game');
    setStarting(false);
  }
}
```

**Step 4: Add the `game:starting` realtime subscription**

Add a `useEffect` after the existing state declarations (before `saveCharacter`). Use the Supabase browser client from `@/lib/supabase/client`:

```ts
import { createBrowserClient } from '@supabase/ssr';

// Inside the component:
useEffect(() => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createBrowserClient(supabaseUrl, supabaseKey);

  const channel = supabase
    .channel(`campaign:${campaign.id}`)
    .on('broadcast', { event: 'game:starting' }, () => {
      router.push(`/campaign/${campaign.id}/game`);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [campaign.id, router]);
```

**Step 5: Update the "Start Game" button**

Find the existing `<Button>` for "Start Game" (around line 683 in the current file) and replace it:

```tsx
<Button
  className="w-full"
  disabled={!allReady || starting}
  style={allReady && !starting ? {} : { opacity: 0.4, cursor: 'not-allowed' }}
  title={allReady ? undefined : 'Waiting for all players to be ready'}
  onClick={handleStartGame}
>
  {starting ? 'Starting…' : 'Start Game'}
</Button>
{startError && (
  <p className="mt-2 text-center text-sm" style={{ color: 'var(--furnace)' }}>
    {startError}
  </p>
)}
```

**Step 6: Verify the client import is available**

```bash
grep -r "createBrowserClient" /Users/marcosteixeira/Dev/saga/.worktrees/feat/start-campaign-action/lib/supabase/client.ts
```

If `createBrowserClient` is not used there, check what the client file exports and use that instead. The existing browser client pattern in the project should be followed.

**Step 7: Manual test**

1. `yarn dev` in the worktree directory
2. Open two browser tabs — one as host, one as player
3. Both join lobby, both mark ready
4. Host clicks "Start Game"
5. Verify: both tabs redirect to `/campaign/[id]/game`

**Step 8: Commit**

```bash
git add app/campaign/[id]/lobby/LobbyClient.tsx
git commit -m "feat: wire Start Game button and game:starting redirect in lobby"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all tests**

```bash
cd /Users/marcosteixeira/Dev/saga/.worktrees/feat/start-campaign-action
yarn test
```

Expected: all tests passing, no failures.

**Step 2: If tests fail, fix them before proceeding**

Do not proceed to commit if tests are failing.

**Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: fix any test/lint issues after start campaign implementation"
```
