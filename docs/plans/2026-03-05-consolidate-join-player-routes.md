# Consolidate Join + Player Routes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the separate `/api/campaign/[id]/join` (create) and `/api/campaign/[id]/player` (update) routes with a single `/api/campaign/[id]/join` route that upserts player data.

**Architecture:** The new `POST /api/campaign/[id]/join` checks for an existing player record for the authenticated user in the campaign. If none exists, it creates one (requires `username`, `character_name`, `character_class`). If one exists, it updates character fields with whatever is passed. The `/player` route and its tests are deleted, and the frontend `saveCharacter` call is pointed at `/join`.

**Tech Stack:** Next.js App Router route handlers, Supabase service-role client, Vitest

---

### Task 1: Update the join route to support upsert

**Files:**
- Modify: `app/api/campaign/[id]/join/route.ts`

**Step 1: Replace the full file with the upsert implementation**

```typescript
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>

  const supabase = createServerSupabaseClient()

  // Check if player already exists for this user in this campaign
  const { data: existing } = await supabase
    .from('players')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    // UPDATE path: apply character fields if provided
    const updates: Record<string, unknown> = { is_ready: false }

    if (typeof b.character_name === 'string' && b.character_name.trim()) {
      updates.character_name = b.character_name.trim()
    }
    if (typeof b.character_class === 'string' && b.character_class.trim()) {
      updates.character_class = b.character_class.trim()
    }
    if (b.character_backstory !== undefined) {
      updates.character_backstory =
        typeof b.character_backstory === 'string' && b.character_backstory.trim()
          ? b.character_backstory.trim()
          : null
    }

    const { data: updated, error: updateError } = await supabase
      .from('players')
      .update(updates)
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Failed to update player' }, { status: 500 })
    }

    return NextResponse.json({ player: updated }, { status: 200 })
  }

  // CREATE path: username, character_name, character_class required
  if (typeof b.username !== 'string' || !b.username.trim()) {
    return NextResponse.json({ error: 'Missing required field: username' }, { status: 400 })
  }
  if (typeof b.character_name !== 'string' || !b.character_name.trim()) {
    return NextResponse.json({ error: 'Missing required field: character_name' }, { status: 400 })
  }
  if (typeof b.character_class !== 'string' || !b.character_class.trim()) {
    return NextResponse.json({ error: 'Missing required field: character_class' }, { status: 400 })
  }
  const username = b.username.trim()
  const character_name = b.character_name.trim()
  const character_class = b.character_class.trim()
  const character_backstory = typeof b.character_backstory === 'string' && b.character_backstory.trim()
    ? b.character_backstory.trim()
    : null

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

  const { count, error: countError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  if (countError) {
    return NextResponse.json({ error: 'Failed to check player count' }, { status: 500 })
  }
  if ((count ?? 0) >= 6) {
    return NextResponse.json({ error: 'Campaign is full (max 6 players)' }, { status: 409 })
  }

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({
      campaign_id: campaignId,
      user_id: user.id,
      username,
      character_name,
      character_class,
      character_backstory,
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

**Step 2: Run the existing join tests to confirm they still pass**

```bash
yarn vitest app/api/campaign/\\[id\\]/join --run
```
Expected: all tests pass (existing create-path tests are unaffected).

**Step 3: Commit**

```bash
git add app/api/campaign/\[id\]/join/route.ts
git commit -m "feat: extend join route to upsert player — create on first join, update on subsequent calls"
```

---

### Task 2: Update join route tests to cover the update path

**Files:**
- Modify: `app/api/campaign/[id]/join/__tests__/route.test.ts`

**Step 1: Update the existing "creates a new player" test to include character fields**

The existing test at line ~165 sends `{ username: 'testuser' }` which will now fail 400. Update its body to:

```typescript
      body: JSON.stringify({ username: 'testuser', character_name: 'Arwen', character_class: 'Mage' }),
```

**Step 2: Write the new update-path and validation tests**

Add these test cases to the existing `describe` block (after the last existing test):

```typescript
  it('returns 200 with updated player when player already exists and character fields are passed', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const existingPlayer = { id: 'player-1', user_id: 'user-123', campaign_id: 'camp-1', username: 'testuser', character_name: null, character_class: null }
    const updatedPlayer = { ...existingPlayer, character_name: 'Arwen', character_class: 'Mage', character_backstory: null, is_ready: false }

    const updateMock = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedPlayer, error: null }),
    }
    const updateFn = vi.fn().mockReturnValue(updateMock)
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: existingPlayer, error: null }),
      update: updateFn,
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)

    const req = new Request('http://localhost/api/campaign/camp-1/join', {
      method: 'POST',
      body: JSON.stringify({ character_name: 'Arwen', character_class: 'Mage' }),
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.character_name).toBe('Arwen')
  })

  it('resets is_ready to false when updating existing player', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const existingPlayer = { id: 'player-1', user_id: 'user-123', campaign_id: 'camp-1', username: 'testuser' }

    const updateMock = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { ...existingPlayer, is_ready: false }, error: null }),
    }
    const updateFn = vi.fn().mockReturnValue(updateMock)
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: existingPlayer, error: null }),
      update: updateFn,
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)

    const req = new Request('http://localhost/api/campaign/camp-1/join', {
      method: 'POST',
      body: JSON.stringify({ character_name: 'Arwen', character_class: 'Mage' }),
    })
    await POST(req, makeParams('camp-1'))
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ is_ready: false }))
  })

  it('returns 500 when update DB call fails for existing player', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const existingPlayer = { id: 'player-1', user_id: 'user-123', campaign_id: 'camp-1' }

    const updateMock = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    }
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: existingPlayer, error: null }),
      update: vi.fn().mockReturnValue(updateMock),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)

    const req = new Request('http://localhost/api/campaign/camp-1/join', {
      method: 'POST',
      body: JSON.stringify({ character_name: 'Arwen', character_class: 'Mage' }),
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(500)
  })

  it('returns 400 when character_name is missing on create (no existing player)', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    // existing lookup returns null → triggers create path
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/join', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser', character_class: 'Mage' }),
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('character_name')
  })

  it('returns 400 when character_class is missing on create (no existing player)', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/join', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser', character_name: 'Arwen' }),
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('character_class')
  })

  it('returns 400 on invalid JSON body', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign/camp-1/join', {
      method: 'POST',
      body: 'not-valid-json',
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(400)
  })
```

**Step 2: Run the tests to verify they pass**

```bash
yarn vitest app/api/campaign/\\[id\\]/join --run
```
Expected: all tests pass (including the 4 new ones).

**Step 3: Commit**

```bash
git add app/api/campaign/\[id\]/join/__tests__/route.test.ts
git commit -m "test: add update-path coverage to join route tests"
```

---

### Task 3: Delete the /player route and its tests

**Files:**
- Delete: `app/api/campaign/[id]/player/route.ts`
- Delete: `app/api/campaign/[id]/player/__tests__/route.test.ts`
- Delete (if empty after): `app/api/campaign/[id]/player/__tests__/` directory
- Delete (if empty after): `app/api/campaign/[id]/player/` directory

**Step 1: Delete the files**

```bash
rm app/api/campaign/\[id\]/player/route.ts
rm app/api/campaign/\[id\]/player/__tests__/route.test.ts
rmdir app/api/campaign/\[id\]/player/__tests__/
rmdir app/api/campaign/\[id\]/player/
```

**Step 2: Verify the player route no longer exists**

```bash
ls app/api/campaign/\[id\]/
```
Expected: `join/`, `ready/`, `route.ts` — no `player/` directory.

**Step 3: Run the full test suite to confirm nothing else broke**

```bash
yarn vitest --run
```
Expected: all tests pass, no references to the deleted player tests.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete /player route — superseded by upsert join route"
```

---

### Task 4: Update the frontend to call /join instead of /player

**Files:**
- Modify: `app/campaign/[id]/lobby/LobbyClient.tsx:458`

**Step 1: Update the fetch call in `saveCharacter`**

In `saveCharacter` (around line 458), change:

```typescript
      const res = await fetch(`/api/campaign/${campaign.id}/player`, {
        method: 'PATCH',
```

to:

```typescript
      const res = await fetch(`/api/campaign/${campaign.id}/join`, {
        method: 'POST',
```

**Step 2: Run the full test suite one final time**

```bash
yarn vitest --run
```
Expected: all tests pass.

**Step 3: Commit**

```bash
git add app/campaign/\[id\]/lobby/LobbyClient.tsx
git commit -m "feat: wire saveCharacter to POST /join instead of PATCH /player"
```
