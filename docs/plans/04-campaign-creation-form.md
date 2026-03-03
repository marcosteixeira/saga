# PR 04: Campaign Creation (Form + DB Insert)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the campaign creation form and API route that inserts a campaign into the database. No AI generation yet — that comes in PR 05. This PR establishes the form → API → DB → redirect flow.

**Architecture:** Client-side form component posts to a Next.js API route, which inserts into Supabase and returns the campaign ID. The form generates a session token (UUID) and stores it in localStorage for later host identification. After creation, redirects to the lobby.

**Tech Stack:** Next.js API Routes, Supabase, shadcn/ui (form components), `crypto.randomUUID()`

**Depends on:** PR 03

---

### Task 1: Install Additional shadcn/ui Components

**Step 1: Add form-related components**

Run:
```bash
npx shadcn@latest add textarea
npx shadcn@latest add card
npx shadcn@latest add label
```

**Step 2: Commit**

```bash
git add -A && git commit -m "chore: add shadcn textarea, card, and label components"
```

---

### Task 2: Build Campaign Creation API Route

**Files:**
- Create: `app/api/campaign/route.ts`

**Spec:**

`POST /api/campaign`

Request body:
```json
{
  "name": "The Lost Mines",
  "host_username": "DungeonMaster42",
  "world_description": "A dark medieval world where...",
  "system_description": "Optional custom rules..."
}
```

Behavior:
1. Validate required fields: `name`, `host_username`, `world_description` (non-empty strings)
2. Generate `host_session_token` as UUID on the server
3. Insert into `campaigns` table with `status: 'lobby'`
4. Return `{ id, host_session_token }` with status 201

Error responses:
- 400 if required fields missing or empty
- 500 if DB insert fails

**Step 1: Write tests for the API route**

Create: `app/api/campaign/__tests__/route.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: () => ({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle
        })
      })
    })
  }))
}))

describe('POST /api/campaign', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ host_username: 'test', world_description: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when host_username is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', world_description: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when world_description is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', host_username: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 201 with campaign id on success', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'campaign-123', host_session_token: 'token-abc' },
      error: null
    })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Campaign',
        host_username: 'TestHost',
        world_description: 'A dark world...'
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBe('campaign-123')
    expect(data.host_session_token).toBe('token-abc')
  })

  it('returns 500 when DB insert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'DB error' }
    })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        host_username: 'Host',
        world_description: 'World...'
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
```

**Step 2: Run tests — verify they fail**

Run: `npx vitest run app/api/campaign`
Expected: FAIL (route.ts doesn't exist yet)

**Step 3: Implement the API route**

Create `app/api/campaign/route.ts` implementing the spec above.

**Step 4: Run tests — verify they pass**

Run: `npx vitest run app/api/campaign`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: POST /api/campaign route with validation"
```

---

### Task 3: Build the Campaign Creation Form

**Files:**
- Create: `components/campaign/WorldGenForm.tsx`
- Modify: `app/campaign/new/page.tsx`

**Form Spec:**

Fields:
- **Your Name** (text input, required) — maps to `host_username`
- **Campaign Name** (text input, required) — maps to `name`
- **Describe Your World** (textarea, required) — maps to `world_description`. Placeholder: "A dark medieval kingdom where dragons have returned after a thousand years..."
- **Custom Rules** (textarea, optional) — maps to `system_description`. Placeholder: "Leave blank to use standard d20 rules"

Behavior:
1. Client generates `session_token = crypto.randomUUID()` and stores it in `localStorage` as `saga_session_token`
2. On submit: POST to `/api/campaign` with form data
3. On success: store the returned `host_session_token` in localStorage as `saga_session_token` (overwrite the client-generated one), then redirect to `/campaign/[id]/lobby`
4. On error: show error message inline
5. Disable submit button while request is in flight

**Step 1: Implement WorldGenForm component**

Client component with `useState` for each field + `loading` + `error` states. Uses shadcn `Input`, `Textarea`, `Button`, `Label`, `Card`.

**Step 2: Wire into the page**

`app/campaign/new/page.tsx` renders `WorldGenForm` centered on the page with the dark fantasy theme.

**Step 3: Visual test**

- Form renders with all 4 fields
- Submit with empty required fields → shows validation (browser native or inline)
- Submit with valid data → loading state → redirects to `/campaign/[id]/lobby` (lobby page shows placeholder from PR 01)
- Session token stored in localStorage

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: campaign creation form with DB persistence"
```

---

### Task 4: Create GET Campaign API Route

**Files:**
- Create: `app/api/campaign/[id]/route.ts`

**Spec:**

`GET /api/campaign/[id]`

Returns the full campaign row plus its players and campaign files.

Response:
```json
{
  "campaign": { ... },
  "players": [ ... ],
  "files": [ ... ]
}
```

Error responses:
- 404 if campaign not found

**Step 1: Write tests**

Create: `app/api/campaign/[id]/__tests__/route.test.ts`

Test cases:
- Returns 404 when campaign doesn't exist
- Returns campaign data with players and files on success

**Step 2: Run tests — verify they fail**

**Step 3: Implement the route**

Query `campaigns`, `players` (where campaign_id matches), and `campaign_files` (where campaign_id matches) in parallel. Return combined response.

**Step 4: Run tests — verify they pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: GET /api/campaign/[id] route"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| POST /api/campaign | Unit test (vitest) | 5 test cases: 3 validation, 1 success, 1 DB error |
| GET /api/campaign/[id] | Unit test (vitest) | 2 test cases: not found, success |
| Form behavior | Visual/manual | Submit flow, loading state, redirect, localStorage |
| Session token | Visual/manual | Check localStorage after form submit |

---

## Acceptance Criteria

- [ ] `POST /api/campaign` validates input and inserts into DB (5 tests passing)
- [ ] `GET /api/campaign/[id]` returns campaign + players + files (2 tests passing)
- [ ] Campaign creation form renders with all fields
- [ ] Form submits to API, stores session token in localStorage, redirects to lobby
- [ ] Loading state shown during submission
- [ ] Error messages shown on failure
- [ ] `yarn build` succeeds
