# Character Saving Endpoints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the lobby character form to real API endpoints so character data persists in Supabase.

**Architecture:** Three endpoints — join (upsert player row), character save (PATCH character fields), and ready toggle (PATCH is_ready). The lobby page server component already fetches players from Supabase; the client just needs to call these endpoints and optimistically update local state.

**Tech Stack:** Next.js 14 App Router API routes, Supabase (service role for writes), `createAuthServerClient` for auth identity, TypeScript.

---

## Context

- `app/campaign/[id]/lobby/LobbyClient.tsx` — character form is UI-only, `saveCharacter()` only updates local state
- `types/player.ts` — `Player` type has `character_name | null`, `character_class | null`, `character_backstory | null`, no `is_ready` field
- `players` DB table — has `character_name`, `character_class`, `character_backstory` columns; **no `is_ready` column yet**
- Existing API pattern: `createAuthServerClient()` for auth, `createServerSupabaseClient()` for DB writes (service role)
- Tests live alongside routes: `app/api/campaign/[id]/__tests__/route.test.ts`

---

## Task 1: DB Migration — Add `is_ready` to players

**Files:**
- DB migration (via MCP tool, no file to create)

**Step 1: Apply the migration**

Using `mcp__supabase__apply_migration`:
```sql
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_ready boolean NOT NULL DEFAULT false;
```

Migration name: `add_is_ready_to_players`

**Step 2: Update the Player type**

Modify: `types/player.ts`

Add `is_ready: boolean` field:

```ts
export type Player = {
  id: string
  campaign_id: string
  user_id: string
  username: string
  character_name: string | null
  character_class: string | null
  character_backstory: string | null
  character_image_url: string | null
  stats: { hp: number; hp_max: number }
  status: 'active' | 'dead' | 'incapacitated' | 'absent'
  absence_mode: 'skip' | 'npc' | 'auto_act'
  is_host: boolean
  is_ready: boolean
  last_seen_at: string
  joined_at: string
}
```

**Step 3: Commit**

```bash
git add types/player.ts
git commit -m "feat: add is_ready column to players and update Player type"
```

---

## Task 2: POST /api/campaign/[id]/player — Upsert player row

**Files:**
- Modify: `app/api/campaign/[id]/player/__tests__/route.test.ts`
- Modify: `app/api/campaign/[id]/player/route.ts`

**What it does:** Creates a player row for the authenticated user in the campaign. Idempotent — if the user is already a player, returns the existing row. Validates the campaign exists. Does NOT allow joining a campaign that has already started (status !== 'lobby').

**Step 1: Write the failing tests**

Modify existing `app/api/campaign/[id]/player/__tests__/route.test.ts`:

```ts
import { POST } from '../route'
import { NextResponse } from 'next/server'

// Mock Supabase clients
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-123', user_metadata: { display_name: 'testuser' } }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/campaign/[id]/player', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const req = new Request('http://localhost/api/campaign//player', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when username is missing', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign//player', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when campaign does not exist', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign//player', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign is not in lobby status', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'active' }, error: null }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign//player', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('abc'))
    expect(res.status).toBe(409)
  })

  it('returns 200 with existing player if already joined', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const existingPlayer = { id: 'player-1', user_id: 'user-123', campaign_id: 'camp-1', username: 'testuser' }

    // Mock chained calls: campaign lookup then player lookup
    const singleResponses = [
      { data: { id: 'camp-1', status: 'lobby' }, error: null },
      { data: existingPlayer, error: null },
    ]
    let callCount = 0
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => Promise.resolve(singleResponses[callCount++])),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign//player', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.id).toBe('player-1')
  })

  it('creates a new player and returns 201', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const newPlayer = { id: 'player-new', user_id: 'user-123', campaign_id: 'camp-1', username: 'testuser' }

    let callCount = 0
    const singleResponses = [
      { data: { id: 'camp-1', status: 'lobby' }, error: null }, // campaign lookup
      { data: null, error: { code: 'PGRST116' } }, // player lookup → not found
      { data: newPlayer, error: null },              // insert
    ]
    const mockInsert = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(singleResponses[2]),
    }
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        const r = singleResponses[callCount++]
        return Promise.resolve(r)
      }),
      insert: vi.fn().mockReturnValue(mockInsert),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign//player', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.player.id).toBe('player-new')
  })
})
```

**Step 2: Run tests to see them fail**

```bash
yarn vitest app/api/campaign/\\[id\\]/player/__tests__/route.test.ts --run
```

Expected: FAIL — assertions should fail until the route logic is updated.

**Step 3: Implement the route**

Modify `app/api/campaign/[id]/player/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const username: string = body.username?.trim()

  if (!username) {
    return NextResponse.json({ error: 'Missing required field: username' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Verify campaign exists and is still in lobby
  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .single()

  if (campError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'lobby') {
    return NextResponse.json({ error: 'Campaign has already started' }, { status: 409 })
  }

  // Check if already joined
  const { data: existing } = await supabase
    .from('players')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ player: existing }, { status: 200 })
  }

  // Insert new player
  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({
      campaign_id: campaignId,
      user_id: user.id,
      username,
      is_host: false,
    })
    .select('*')
    .single()

  if (insertError || !player) {
    return NextResponse.json({ error: 'Failed to join campaign' }, { status: 500 })
  }

  return NextResponse.json({ player }, { status: 201 })
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn vitest app/api/campaign/\\[id\\]/player/__tests__/route.test.ts --run
```

Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add app/api/campaign/\[id\]/player/
git commit -m "feat: add POST /api/campaign/[id]/player endpoint"
```

---

## Task 3: PATCH /api/campaign/[id]/player — Save character fields

**Files:**
- Modify: `app/api/campaign/[id]/player/__tests__/route.test.ts`
- Modify: `app/api/campaign/[id]/player/route.ts`

**What it does:** Updates `character_name`, `character_class`, `character_backstory` for the authenticated user's player row in this campaign. Requires the user to already be a player. Validates inputs.

**Step 1: Write the failing tests**

Modify existing `app/api/campaign/[id]/player/__tests__/route.test.ts`:

```ts
import { PATCH } from '../route'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-123' }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/campaign/[id]/player', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/player', {
      method: 'PATCH',
      body: JSON.stringify({ character_name: 'Aldric', character_class: 'Warrior' }),
    })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when character_name is missing', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/player', {
      method: 'PATCH',
      body: JSON.stringify({ character_class: 'Warrior' }),
    })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when character_class is missing', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/player', {
      method: 'PATCH',
      body: JSON.stringify({ character_name: 'Aldric' }),
    })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when player row does not exist', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/player', {
      method: 'PATCH',
      body: JSON.stringify({ character_name: 'Aldric', character_class: 'Warrior' }),
    })
    const res = await PATCH(req, makeParams('camp-1'))
    expect(res.status).toBe(404)
  })

  it('updates character and returns 200 with updated player', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const updatedPlayer = {
      id: 'player-1',
      user_id: 'user-123',
      campaign_id: 'camp-1',
      character_name: 'Aldric',
      character_class: 'Warrior',
      character_backstory: 'A wanderer',
    }
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedPlayer, error: null }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/player', {
      method: 'PATCH',
      body: JSON.stringify({ character_name: 'Aldric', character_class: 'Warrior', character_backstory: 'A wanderer' }),
    })
    const res = await PATCH(req, makeParams('camp-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.character_name).toBe('Aldric')
  })
})
```

**Step 2: Run tests to see them fail**

```bash
yarn vitest app/api/campaign/\\[id\\]/player/__tests__/route.test.ts --run
```

Expected: FAIL — assertions should fail until the route logic is updated.

**Step 3: Implement the route**

Modify `app/api/campaign/[id]/player/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const character_name: string = body.character_name?.trim()
  const character_class: string = body.character_class?.trim()
  const character_backstory: string | null = body.character_backstory?.trim() || null

  if (!character_name) {
    return NextResponse.json({ error: 'Missing required field: character_name' }, { status: 400 })
  }
  if (!character_class) {
    return NextResponse.json({ error: 'Missing required field: character_class' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: player, error } = await supabase
    .from('players')
    .update({ character_name, character_class, character_backstory, is_ready: false })
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !player) {
    return NextResponse.json({ error: 'Player not found in this campaign' }, { status: 404 })
  }

  return NextResponse.json({ player }, { status: 200 })
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn vitest app/api/campaign/\\[id\\]/player/__tests__/route.test.ts --run
```

Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add app/api/campaign/\[id\]/player/
git commit -m "feat: add PATCH /api/campaign/[id]/player endpoint"
```

---

## Task 4: PATCH /api/campaign/[id]/ready — Toggle ready status

**Files:**
- Modify: `app/api/campaign/[id]/ready/__tests__/route.test.ts`
- Modify: `app/api/campaign/[id]/ready/route.ts`

**What it does:** Sets `is_ready` for the authenticated user's player row. Body: `{ is_ready: boolean }`. Requires character to be saved (character_name and character_class non-null) before allowing is_ready=true.

**Step 1: Write the failing tests**

Modify existing `app/api/campaign/[id]/ready/__tests__/route.test.ts`:

```ts
import { PATCH } from '../route'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-123' }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/campaign/[id]/ready', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/ready', {
      method: 'PATCH',
      body: JSON.stringify({ is_ready: true }),
    })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when is_ready is not a boolean', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/ready', {
      method: 'PATCH',
      body: JSON.stringify({ is_ready: 'yes' }),
    })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 422 when trying to mark ready without a character saved', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const playerWithoutChar = { id: 'player-1', character_name: null, character_class: null }
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: playerWithoutChar, error: null }),
      update: vi.fn().mockReturnThis(),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/ready', {
      method: 'PATCH',
      body: JSON.stringify({ is_ready: true }),
    })
    const res = await PATCH(req, makeParams('camp-1'))
    expect(res.status).toBe(422)
  })

  it('returns 404 when player not found', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      update: vi.fn().mockReturnThis(),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/ready', {
      method: 'PATCH',
      body: JSON.stringify({ is_ready: true }),
    })
    const res = await PATCH(req, makeParams('camp-1'))
    expect(res.status).toBe(404)
  })

  it('sets is_ready and returns 200', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const playerWithChar = { id: 'player-1', character_name: 'Aldric', character_class: 'Warrior' }
    const updatedPlayer = { ...playerWithChar, is_ready: true }
    let callCount = 0
    const singleResponses = [
      { data: playerWithChar, error: null }, // fetch player
      { data: updatedPlayer, error: null },  // update
    ]
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => Promise.resolve(singleResponses[callCount++])),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/ready', {
      method: 'PATCH',
      body: JSON.stringify({ is_ready: true }),
    })
    const res = await PATCH(req, makeParams('camp-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.is_ready).toBe(true)
  })
})
```

**Step 2: Run tests to see them fail**

```bash
yarn vitest app/api/campaign/\\[id\\]/ready/__tests__/route.test.ts --run
```

Expected: FAIL — assertions should fail until the route logic is updated.

**Step 3: Implement the route**

Modify `app/api/campaign/[id]/ready/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  if (typeof body.is_ready !== 'boolean') {
    return NextResponse.json({ error: 'Missing or invalid field: is_ready must be boolean' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Fetch current player row to validate state
  const { data: current, error: fetchError } = await supabase
    .from('players')
    .select('id, character_name, character_class')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !current) {
    return NextResponse.json({ error: 'Player not found in this campaign' }, { status: 404 })
  }

  // Can't mark ready without a character
  if (body.is_ready && (!current.character_name || !current.character_class)) {
    return NextResponse.json(
      { error: 'Character must be saved before marking ready' },
      { status: 422 }
    )
  }

  const { data: player, error: updateError } = await supabase
    .from('players')
    .update({ is_ready: body.is_ready })
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (updateError || !player) {
    return NextResponse.json({ error: 'Failed to update ready status' }, { status: 500 })
  }

  return NextResponse.json({ player }, { status: 200 })
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn vitest app/api/campaign/\\[id\\]/ready/__tests__/route.test.ts --run
```

Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add app/api/campaign/\[id\]/ready/
git commit -m "feat: add PATCH /api/campaign/[id]/ready endpoint"
```

---

## Task 5: Wire LobbyClient to the API endpoints

**Files:**
- Modify: `app/campaign/[id]/lobby/LobbyClient.tsx`

**What it does:** Replace local-only `saveCharacter()` and `handleReady()` with real fetch calls. Show loading/error states. Use the campaign `id` prop (already available via `campaign.id`).

**Step 1: Update `LobbyClientProps` to expose campaign id**

The `campaign` prop already has `id` (it's a `Campaign` type). No change needed.

**Step 2: Update `saveCharacter` to call the API**

Replace the local-only `saveCharacter` function with an async version that calls `PATCH /api/campaign/[id]/player`. Add a `saving` state boolean.

Find the existing `saveCharacter` function and replace it:

```ts
const [saving, setSaving] = useState(false)
const [saveError, setSaveError] = useState<string | null>(null)

async function saveCharacter() {
  if (!charName.trim() || !charClass) return
  setSaving(true)
  setSaveError(null)
  try {
    const res = await fetch(`/api/campaign/${campaign.id}/player`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character_name: charName.trim(),
        character_class: charClass,
        character_backstory: backstory || null,
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      setSaveError(data.error ?? 'Failed to save character')
      return
    }
    setPlayers((prev) =>
      prev.map((p) =>
        p.isCurrentUser
          ? { ...p, characterName: charName.trim(), characterClass: charClass, backstory }
          : p
      )
    )
    setCharSaved(true)
    setFormDirty(false)
    setIsReady(false)
  } finally {
    setSaving(false)
  }
}
```

**Step 3: Update `handleReady` to call the API**

Replace `handleReady` with:

```ts
const [readying, setReadying] = useState(false)

async function handleReady() {
  setReadying(true)
  try {
    const res = await fetch(`/api/campaign/${campaign.id}/ready`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_ready: true }),
    })
    if (!res.ok) return
    setIsReady(true)
    setPlayers((prev) =>
      prev.map((p) => (p.isCurrentUser ? { ...p, status: 'ready' } : p))
    )
  } finally {
    setReadying(false)
  }
}
```

**Step 4: Update `handleEditCharacter` to call the API**

```ts
async function handleEditCharacter() {
  await fetch(`/api/campaign/${campaign.id}/ready`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_ready: false }),
  })
  setIsReady(false)
  setPlayers((prev) =>
    prev.map((p) => (p.isCurrentUser ? { ...p, status: 'not_ready' } : p))
  )
}
```

**Step 5: Update the Save button to show loading state**

In the JSX, update the Save button:
```tsx
<Button
  type="submit"
  className="w-full"
  disabled={!charName.trim() || !charClass || saving}
  variant={charSaved && !formDirty ? 'outline' : 'default'}
>
  {saving ? 'Saving…' : charSaved && !formDirty ? 'Character Saved ✓' : 'Save Character'}
</Button>
```

Add error display below the actions div:
```tsx
{saveError && (
  <p className="text-xs text-center" style={{ color: 'var(--furnace)' }}>
    {saveError}
  </p>
)}
```

Update "I'm Ready" button:
```tsx
<Button
  type="button"
  className="w-full"
  onClick={handleReady}
  disabled={readying}
>
  {readying ? 'Updating…' : "I'm Ready"}
</Button>
```

**Step 6: Also update `is_ready` state from DB on mount**

In the `LobbyClientProps`, `players` come from Supabase with `is_ready`. Update the initial `isReady` state:

```ts
const currentUserFromDb = dbPlayers.find((p) => p.user_id === currentUserId)
const [isReady, setIsReady] = useState(currentUserFromDb?.is_ready ?? false)
```

And map `is_ready` to `status` in `uiPlayers`:
```ts
const uiPlayers: Player[] = dbPlayers.map((p) => ({
  ...
  status: p.is_ready ? 'ready' : 'not_ready' as PlayerStatus
}))
```

**Step 7: Manual verification**

- Open lobby page while logged in
- Fill character name + class → click "Save Character" → verify network request to `/api/campaign/[id]/player` returns 200
- Click "I'm Ready" → verify request to `/api/campaign/[id]/ready` returns 200
- Refresh the page → character and ready state should persist

**Step 8: Commit**

```bash
git add app/campaign/\[id\]/lobby/LobbyClient.tsx
git commit -m "feat: wire lobby character form to API endpoints"
```

---

## Task 6: Run all tests

**Step 1:**

```bash
yarn test
```

Expected: All existing tests pass, 15 new tests pass (5 per endpoint × 3 endpoints).

**Step 2: If any tests fail**, read the error output carefully and fix the failing test or implementation before proceeding.

**Step 3: Commit if any fixups were needed**

```bash
git add -p
git commit -m "fix: address test failures after wiring character endpoints"
```
