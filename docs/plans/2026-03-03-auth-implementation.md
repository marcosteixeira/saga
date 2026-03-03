# Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Supabase magic-link authentication for both hosts and players, replacing session tokens in localStorage with proper Supabase Auth sessions and `auth.users` FK references.

**Architecture:** Custom login page calls `supabase.auth.signInWithOtp({ email })`, a callback route at `/auth/callback` exchanges the OTP code for a session cookie, and Next.js middleware protects page routes. The DB drops `host_session_token` / `session_token` columns and replaces them with `host_user_id` / `user_id` FKs to `auth.users`. API routes read the authenticated user from the session instead of generating tokens.

**Tech Stack:** Next.js 14 App Router, `@supabase/ssr` (already installed), Supabase Auth, Vitest

---

## Task 1: DB Migration — Replace Session Token Columns + Enable RLS

**Files:**
- No files to create/modify — run SQL via Supabase MCP tool

**Step 1: Apply the migration**

Use the Supabase MCP `apply_migration` tool with name `add_auth_user_ids` and this SQL:

```sql
-- campaigns: replace host_session_token with host_user_id FK
ALTER TABLE campaigns
  DROP COLUMN host_session_token,
  ADD COLUMN host_user_id UUID REFERENCES auth.users(id) NOT NULL;

-- players: replace session_token with user_id FK
ALTER TABLE players
  DROP COLUMN session_token,
  ADD COLUMN user_id UUID REFERENCES auth.users(id) NOT NULL;

-- RLS on campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read campaigns"
  ON campaigns FOR SELECT USING (true);
CREATE POLICY "authenticated users can insert campaigns"
  ON campaigns FOR INSERT WITH CHECK (auth.uid() = host_user_id);
CREATE POLICY "host can update own campaign"
  ON campaigns FOR UPDATE USING (auth.uid() = host_user_id);
CREATE POLICY "host can delete own campaign"
  ON campaigns FOR DELETE USING (auth.uid() = host_user_id);

-- RLS on players
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read players"
  ON players FOR SELECT USING (true);
CREATE POLICY "authenticated users can insert players"
  ON players FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "player can update own row"
  ON players FOR UPDATE USING (auth.uid() = user_id);
```

**Step 2: Verify via Supabase MCP**

Run via `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'campaigns' AND column_name IN ('host_session_token', 'host_user_id');
```
Expected: only `host_user_id` appears (no `host_session_token`).

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'players' AND column_name IN ('session_token', 'user_id');
```
Expected: only `user_id` appears.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: DB migration — auth user_id FKs + RLS on campaigns and players"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `types/campaign.ts`
- Modify: `types/player.ts`

**Step 1: Update `types/campaign.ts`**

Replace:
```ts
export type Campaign = {
  id: string
  name: string
  host_username: string
  host_session_token: string   // <-- remove this
  // ...
}

export type CampaignInsert = Pick<
  Campaign,
  'name' | 'host_username' | 'host_session_token' | 'world_description'  // <-- change
> & { ... }
```

With:
```ts
export type Campaign = {
  id: string
  name: string
  host_username: string
  host_user_id: string
  world_description: string
  system_description: string | null
  cover_image_url: string | null
  map_image_url: string | null
  status: 'lobby' | 'active' | 'paused' | 'ended'
  turn_mode: 'free' | 'sequential'
  turn_timer_seconds: number
  current_session_id: string | null
  created_at: string
}

export type CampaignInsert = Pick<
  Campaign,
  'name' | 'host_username' | 'host_user_id' | 'world_description'
> & {
  system_description?: string
  cover_image_url?: string
  map_image_url?: string
}
```

**Step 2: Update `types/player.ts`**

Replace `session_token: string` with `user_id: string`. Replace in `PlayerInsert` too:

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
  last_seen_at: string
  joined_at: string
}

export type PlayerInsert = Pick<
  Player,
  'campaign_id' | 'user_id' | 'username'
> & {
  character_name?: string
  character_class?: string
  character_backstory?: string
  is_host?: boolean
}
```

**Step 3: Verify TypeScript compiles**

```bash
yarn tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add types/campaign.ts types/player.ts
git commit -m "feat: update Campaign and Player types — session tokens replaced with user_id FKs"
```

---

## Task 3: Add Auth-Aware Server Client

**Files:**
- Modify: `lib/supabase/server.ts`
- Create: `lib/supabase/__tests__/auth-client.test.ts`

**Step 1: Write the failing test**

Create `lib/supabase/__tests__/auth-client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

const mockCreateServerClient = vi.fn(() => ({ auth: { getUser: vi.fn() } }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    getAll: () => [{ name: 'sb-token', value: 'abc' }],
    set: vi.fn(),
  })),
}))

describe('createAuthServerClient', () => {
  it('calls createServerClient with url, key, and cookie handlers', async () => {
    const { createAuthServerClient } = await import('../server')
    await createAuthServerClient()
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ cookies: expect.any(Object) })
    )
  })
})
```

**Step 2: Run test to verify it fails**

```bash
yarn test lib/supabase/__tests__/auth-client.test.ts
```
Expected: FAIL — `createAuthServerClient is not a function`

**Step 3: Add `createAuthServerClient` to `lib/supabase/server.ts`**

Append to the existing file (keep the existing `createServerSupabaseClient` untouched):

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Auth-aware server client — reads the current user's session from cookies.
// Use this in API routes that need to identify the authenticated user.
// (The existing createServerSupabaseClient uses service role and bypasses RLS — keep using it for admin ops.)
export async function createAuthServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')

  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Silently ignore — setAll called from a Server Component where cookies are read-only.
          // Middleware handles cookie refresh instead.
        }
      },
    },
  })
}
```

**Step 4: Run test to verify it passes**

```bash
yarn test lib/supabase/__tests__/auth-client.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add lib/supabase/server.ts lib/supabase/__tests__/auth-client.test.ts
git commit -m "feat: add createAuthServerClient — SSR-aware Supabase client with cookie session"
```

---

## Task 4: Next.js Middleware — Protect Routes

**Files:**
- Create: `middleware.ts` (project root, next to `package.json`)
- Create: `middleware.test.ts`

**About middleware testing:** Next.js middleware uses `NextRequest` / `NextResponse` from `next/server`. We test the redirect logic by mocking Supabase's `createServerClient` and asserting on the response headers. This is a unit test of our logic, not a full integration test.

**Step 1: Write the failing test**

Create `middleware.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

// Stub next/headers (not used in middleware but may be imported transitively)
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

describe('middleware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects unauthenticated user from /campaign/new to /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const req = new NextRequest('http://localhost/campaign/new')
    const res = await middleware(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('redirect=%2Fcampaign%2Fnew')
  })

  it('allows authenticated user through to /campaign/new', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    const { middleware } = await import('./middleware')
    const req = new NextRequest('http://localhost/campaign/new')
    const res = await middleware(req)
    expect(res.status).not.toBe(307)
  })

  it('allows unauthenticated access to /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const req = new NextRequest('http://localhost/login')
    const res = await middleware(req)
    expect(res.status).not.toBe(307)
  })

  it('allows unauthenticated access to /', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { middleware } = await import('./middleware')
    const req = new NextRequest('http://localhost/')
    const res = await middleware(req)
    expect(res.status).not.toBe(307)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
yarn test middleware.test.ts
```
Expected: FAIL — module not found

**Step 3: Create `middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/campaign/new', '/campaign/']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|api/).*)',
  ],
}
```

**Step 4: Run tests**

```bash
yarn test middleware.test.ts
```
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add middleware.ts middleware.test.ts
git commit -m "feat: Next.js middleware — redirect unauthenticated users to /login"
```

---

## Task 5: Auth Callback Route

**Files:**
- Create: `app/auth/callback/route.ts`
- Create: `app/auth/callback/__tests__/route.test.ts`

**Step 1: Write the failing test**

Create `app/auth/callback/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExchangeCode = vi.fn()
const mockCreateServerClient = vi.fn(() => ({
  auth: { exchangeCodeForSession: mockExchangeCode },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    getAll: () => [],
    set: vi.fn(),
  })),
}))

describe('GET /auth/callback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exchanges code and redirects to /redirect param on success', async () => {
    mockExchangeCode.mockResolvedValue({ error: null })
    const { GET } = await import('../route')
    const req = new Request(
      'http://localhost/auth/callback?code=test-code&redirect=/campaign/new'
    )
    const res = await GET(req as any)
    expect(mockExchangeCode).toHaveBeenCalledWith('test-code')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/campaign/new')
  })

  it('redirects to / when no redirect param', async () => {
    mockExchangeCode.mockResolvedValue({ error: null })
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback?code=test-code')
    const res = await GET(req as any)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('redirects to /login?error=auth_failed when exchange fails', async () => {
    mockExchangeCode.mockResolvedValue({ error: { message: 'invalid code' } })
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback?code=bad-code')
    const res = await GET(req as any)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('error=auth_failed')
  })

  it('redirects to /login?error=auth_failed when no code in URL', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback')
    const res = await GET(req as any)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('error=auth_failed')
    expect(mockExchangeCode).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
yarn test app/auth/callback/__tests__/route.test.ts
```
Expected: FAIL — module not found

**Step 3: Create `app/auth/callback/route.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  return NextResponse.redirect(`${origin}${redirect}`)
}
```

**Step 4: Run tests**

```bash
yarn test app/auth/callback/__tests__/route.test.ts
```
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add app/auth/callback/route.ts app/auth/callback/__tests__/route.test.ts
git commit -m "feat: auth callback route — exchanges OTP code for session cookie"
```

---

## Task 6: Login Page

**Files:**
- Create: `app/login/page.tsx`

This is a UI component — tested manually. No unit test needed (pure presentational + one Supabase call).

**Step 1: Create `app/login/page.tsx`**

```tsx
'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { EmberParticles } from '@/components/ember-particles'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { GearDecoration } from '@/components/gear-decoration'

function LoginForm() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'
  const authError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(
    authError === 'auth_failed' ? 'The magic seal was broken. Try again.' : null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    })

    if (error) {
      setError('The ravens could not deliver the message. Try again.')
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {sent ? (
        <div className="flex flex-col gap-3 text-center">
          <p
            className="text-lg tracking-wide"
            style={{ color: 'var(--brass)', fontFamily: 'var(--font-heading), serif' }}
          >
            A raven has been dispatched.
          </p>
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Check your inbox for a magic link to enter the forge.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="email"
              className="text-xs uppercase tracking-[0.15em]"
              style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
            >
              Your Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: '#a63d2a' }}>
              {error}
            </p>
          )}

          {loading && <div className="piston-loader" aria-label="Loading..." />}

          <Button
            type="submit"
            disabled={loading}
            className="relative overflow-hidden bg-brass text-soot font-bold uppercase tracking-[0.15em] hover:bg-furnace transition-colors duration-300 disabled:opacity-60"
            style={{
              clipPath:
                'polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)',
            }}
          >
            {loading ? 'Summoning...' : 'Send Magic Link'}
          </Button>
        </>
      )}
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="relative min-h-screen bg-soot">
      <GearDecoration />
      <AmbientSmoke />
      <EmberParticles count={15} />
      <div className="furnace-overlay" />
      <div className="vignette" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-md animate-entrance" data-delay="1">
          <div className="iron-plate p-8 md:p-10" style={{ background: 'rgba(42, 37, 32, 0.85)' }}>
            <div className="rivet-bottom-left" />
            <div className="rivet-bottom-right" />

            <div className="mb-8 text-center">
              <div className="brass-nameplate mx-auto mb-4">Enter the Forge</div>
              <h1
                className="text-2xl tracking-[0.08em] text-steam"
                style={{ fontFamily: 'var(--font-heading), serif' }}
              >
                SIGN IN
              </h1>
              <div className="brass-pipe mx-auto mt-4 w-24" />
            </div>

            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  )
}
```

**Step 2: Verify manually**

```bash
yarn dev
```

Visit `http://localhost:3000/campaign/new` without being logged in. Expected: redirected to `/login?redirect=%2Fcampaign%2Fnew`. The login form should render with steampunk styling. Enter an email and submit — should show "A raven has been dispatched."

**Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: login page — magic link form with steampunk styling"
```

---

## Task 7: Update POST /api/campaign Route

**Files:**
- Modify: `app/api/campaign/route.ts`
- Modify: `app/api/campaign/__tests__/route.test.ts`

**Step 1: Update the test first**

Replace the entire contents of `app/api/campaign/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock service-role client (unchanged)
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()

// Mock auth client
const mockGetUser = vi.fn()

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
  beforeEach(() => vi.clearAllMocks())

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

  it('returns 201 with campaign id on success, uses provided host_username', async () => {
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
    expect(data).not.toHaveProperty('host_session_token')
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
    const res = await POST(req)
    expect(res.status).toBe(201)
    // Verify insert was called with user email as host_username
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ host_username: 'gm@saga.com' })
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
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test app/api/campaign/__tests__/route.test.ts
```
Expected: FAIL — 401 test fails (route doesn't check auth yet), `host_session_token` test fails.

**Step 3: Update `app/api/campaign/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAuthServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, world_description, system_description } = body
  const host_username: string = body.host_username?.trim() || user.email!

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
      status: 'lobby',
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
```

**Step 4: Run tests**

```bash
yarn test app/api/campaign/__tests__/route.test.ts
```
Expected: PASS (6 tests)

**Step 5: Run all tests to check for regressions**

```bash
yarn test
```
Expected: all pass.

**Step 6: Commit**

```bash
git add app/api/campaign/route.ts app/api/campaign/__tests__/route.test.ts
git commit -m "feat: POST /api/campaign — authenticate user, derive host_username from auth session"
```

---

## Task 8: Update Campaign Form — Optional Display Name, Remove localStorage

**Files:**
- Modify: `components/campaign/WorldGenForm.tsx`

**Step 1: Update `WorldGenForm.tsx`**

Changes:
1. Make `host_username` optional (no `required` attribute, add hint text)
2. Remove `localStorage.setItem` line
3. Response now returns `{ id }` only — no `host_session_token`

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function WorldGenForm() {
  const router = useRouter()
  const [hostUsername, setHostUsername] = useState('')
  const [name, setName] = useState('')
  const [worldDescription, setWorldDescription] = useState('')
  const [systemDescription, setSystemDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          host_username: hostUsername || undefined,
          world_description: worldDescription,
          system_description: systemDescription || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Check the gauges.')
        return
      }

      router.push(`/campaign/${data.id}/lobby`)
    } catch {
      setError('Connection failure. The pipes are clogged.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Display Name */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="host_username"
          className="text-xs uppercase tracking-[0.15em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Your Name{' '}
          <span className="text-ash/60 normal-case tracking-normal" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
            (optional — defaults to your email)
          </span>
        </Label>
        <Input
          id="host_username"
          type="text"
          value={hostUsername}
          onChange={e => setHostUsername(e.target.value)}
          placeholder="DungeonMaster42"
          className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Campaign Name */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="name"
          className="text-xs uppercase tracking-[0.15em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Campaign Name
        </Label>
        <Input
          id="name"
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="The Lost Mines of Karathos"
          className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Describe Your World */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="world_description"
          className="text-xs uppercase tracking-[0.15em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Describe Your World
        </Label>
        <Textarea
          id="world_description"
          required
          value={worldDescription}
          onChange={e => setWorldDescription(e.target.value)}
          placeholder="A dark medieval kingdom where dragons have returned after a thousand years..."
          rows={4}
          className="resize-none border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Custom Rules (optional) */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="system_description"
          className="text-xs uppercase tracking-[0.15em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Custom Rules{' '}
          <span className="text-ash/60 normal-case tracking-normal" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
            (optional)
          </span>
        </Label>
        <Textarea
          id="system_description"
          value={systemDescription}
          onChange={e => setSystemDescription(e.target.value)}
          placeholder="Leave blank to use standard d20 rules"
          rows={3}
          className="resize-none border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {error && (
        <p
          className="text-sm small-caps"
          style={{ color: '#a63d2a', fontVariant: 'small-caps' }}
        >
          {error}
        </p>
      )}

      {loading && <div className="piston-loader" aria-label="Loading..." />}

      <Button
        type="submit"
        disabled={loading}
        className="relative overflow-hidden bg-brass text-soot font-bold uppercase tracking-[0.15em] hover:bg-furnace transition-colors duration-300 disabled:opacity-60"
        style={{
          clipPath: 'polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)',
        }}
      >
        {loading ? 'Forging...' : 'Forge Campaign'}
      </Button>
    </form>
  )
}
```

**Step 2: Run all tests**

```bash
yarn test
```
Expected: all pass.

**Step 3: Verify manually**

```bash
yarn dev
```

1. Visit `/campaign/new` — should redirect to `/login`
2. Sign in with magic link — check email, click link → lands back on `/campaign/new`
3. "Your Name" field shows `(optional — defaults to your email)`
4. Submit form — should redirect to `/campaign/[id]/lobby`
5. Check Supabase dashboard → campaigns table → `host_user_id` is populated, no `host_session_token` column

**Step 4: Commit**

```bash
git add components/campaign/WorldGenForm.tsx
git commit -m "feat: WorldGenForm — optional display name, remove localStorage session token"
```

---

## Supabase Dashboard Config Required

Before the magic link flow works end-to-end, set the **Site URL** and **Redirect URLs** in the Supabase Auth settings:

- **Site URL:** `http://localhost:3000` (dev) / your Vercel URL (prod)
- **Redirect URLs:** add `http://localhost:3000/auth/callback` and `https://<your-vercel-domain>/auth/callback`

Path: Supabase Dashboard → Authentication → URL Configuration
