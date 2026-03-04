# Campaign Creation Fire-and-Forget Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update `POST /api/campaign` to fire-and-forget the Supabase edge function after campaign creation, instead of waiting for it (or ignoring it entirely as currently).

**Architecture:** After inserting the campaign row with `status: 'generating'`, we call the `generate-world` edge function without `await` and immediately return `{ id }`. The Supabase edge function runs independently; the client navigates to `/campaign/{id}/setup` and polls via Realtime for the status to flip to `'lobby'`.

**Tech Stack:** Next.js App Router API routes, Supabase edge functions, Vitest

---

### Task 1: Update `POST /api/campaign` to fire-and-forget the edge function

**Files:**
- Modify: `app/api/campaign/route.ts`

**Step 1: Read current file**

Open `app/api/campaign/route.ts` and understand the current flow (creates campaign, returns id — no edge function call).

**Step 2: Add fire-and-forget edge function call**

Replace the file content with:

```typescript
import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, world_description, system_description } = body
  const host_username: string =
    body.host_username?.trim() ||
    user.user_metadata?.display_name ||
    user.email ||
    'Unknown Host'

  if (!name || !world_description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name,
      host_username,
      host_user_id: user.id,
      world_description,
      system_description: system_description || null,
      status: 'generating',
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-world`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.GENERATE_WORLD_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.GENERATE_WORLD_WEBHOOK_SECRET}`
  }

  // Fire-and-forget: do not await — return campaign id immediately
  fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      record: { id: data.id, world_description },
    }),
  }).catch(() => {
    // Intentionally swallowed — edge function failures are tracked via campaign status
  })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
```

**Step 3: Verify the file looks correct**

Read `app/api/campaign/route.ts` and confirm:
- Campaign is inserted with `status: 'generating'`
- Edge function is called with `fetch(...)` (no `await`)
- Response returns `{ id }` with status 201 immediately

---

### Task 2: Update tests for `POST /api/campaign`

**Files:**
- Modify: `app/api/campaign/__tests__/route.test.ts`

**Step 1: Read the current test file**

Open `app/api/campaign/__tests__/route.test.ts`.

**Step 2: Add `fetch` mock and edge function assertion**

Replace the full test file with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockGetUser = vi.fn()
const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: () => ({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
  })),
  createAuthServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}))

describe('POST /api/campaign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'World' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } })
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ world_description: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when world_description is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } })
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 201 with campaign id and uses provided host_username', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-123' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Campaign',
        host_username: 'DungeonMaster42',
        world_description: 'A dark world...',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBe('campaign-123')
  })

  it('falls back to email as host_username when not provided', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-456' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'World' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ host_username: 'gm@saga.com' })
    )
  })

  it('inserts campaign with status generating', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-123' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'A dark world' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'generating' })
    )
  })

  it('fires edge function after campaign creation without waiting', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.GENERATE_WORLD_WEBHOOK_SECRET = 'secret-token'
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-999' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'A dark world' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    // Response returns immediately with 201 — does not wait for edge function
    expect(res.status).toBe(201)

    // Edge function is called (fire-and-forget)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/generate-world',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-token',
        }),
        body: expect.stringContaining('campaign-999'),
      })
    )
  })

  it('returns 500 when DB insert fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'World' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('does not fire edge function when DB insert fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'World' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
```

**Step 3: Run the tests**

```bash
yarn test app/api/campaign/__tests__/route.test.ts
```

Expected: All tests pass including the two new ones about edge function firing.

**Step 4: Commit**

```bash
git add app/api/campaign/route.ts app/api/campaign/__tests__/route.test.ts
git commit -m "feat: fire-and-forget edge function on campaign creation"
```

---

### Task 3: Verify existing regenerate tests still pass

The `/regenerate` route is unchanged. Just confirm its tests still pass.

**Step 1: Run regenerate tests**

```bash
yarn test app/api/campaign/[id]/regenerate
```

Expected: All existing tests pass (no changes to that route).

---

### Task 4: Manual smoke test

**Step 1:** Start dev server: `yarn dev`

**Step 2:** Create a new campaign via the form

**Step 3:** Observe:
- Form submits and navigates quickly to `/campaign/{id}/setup` (no long wait)
- The setup page shows "generating" state
- After ~10-30s, Supabase Realtime updates status to `'lobby'`

**Step 4:** Check Supabase edge function logs to confirm `generate-world` was invoked
