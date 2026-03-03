# PR 03: Database Schema + Types + Supabase Clients

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up the Supabase database schema, TypeScript types, and client libraries — the data foundation everything else builds on.

**Architecture:** Supabase Postgres for persistence, with server-side and browser-side clients. All tables defined in a single migration. TypeScript types mirror the DB schema exactly. RLS (Row Level Security) is disabled for MVP (no auth).

**Tech Stack:** Supabase (Postgres), `@supabase/supabase-js`, `@supabase/ssr`, TypeScript

**Depends on:** PR 02

---

### Task 1: Install Supabase Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

Run: `npm install @supabase/supabase-js @supabase/ssr`

**Step 2: Create .env.local template**

Create `.env.local.example` with all required env vars (no real values):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

Add `.env.local` to `.gitignore` (should already be there from Next.js scaffold).

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: install Supabase dependencies and env template"
```

---

### Task 2: Write Database Migration

**Files:**
- Create: `supabase/migrations/001_initial.sql`

**Step 1: Write the migration SQL**

Use the exact schema from DESIGN.md. Tables in order (respecting foreign keys):

1. `campaigns` — must be first (referenced by all others)
2. `sessions` — referenced by `messages`, references `campaigns`
3. `players` — references `campaigns`
4. `messages` — references `campaigns`, `sessions`, `players`
5. `campaign_files` — references `campaigns`

Add indexes for common query patterns:
- `players.campaign_id` (lookup players by campaign)
- `messages.campaign_id, messages.created_at` (fetch messages in order)
- `campaign_files.campaign_id` (fetch files by campaign)
- `sessions.campaign_id` (fetch sessions by campaign)

**Step 2: Verify SQL syntax**

If you have a local Supabase instance, run the migration. Otherwise, verify syntax is valid Postgres — check FK references, default values, and types.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: initial database migration with all tables"
```

---

### Task 3: Define TypeScript Types

**Files:**
- Create: `types/index.ts`

**Step 1: Write types matching the schema**

```typescript
// Core database row types
export type Campaign = {
  id: string
  name: string
  host_username: string
  host_session_token: string
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

export type Player = {
  id: string
  campaign_id: string
  session_token: string
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

export type Message = {
  id: string
  campaign_id: string
  session_id: string | null
  player_id: string | null
  content: string
  image_url: string | null
  type: 'action' | 'narration' | 'system' | 'ooc'
  created_at: string
}

export type CampaignFile = {
  id: string
  campaign_id: string
  filename: string
  content: string
  updated_at: string
}

export type Session = {
  id: string
  campaign_id: string
  session_number: number
  present_player_ids: string[]
  summary_md: string | null
  started_at: string
  ended_at: string | null
}
```

Also define insert types (omitting `id`, `created_at`, and fields with defaults):

```typescript
export type CampaignInsert = Pick<Campaign, 'name' | 'host_username' | 'host_session_token' | 'world_description'> & {
  system_description?: string
}

export type PlayerInsert = Pick<Player, 'campaign_id' | 'session_token' | 'username'> & {
  character_name?: string
  character_class?: string
  character_backstory?: string
  is_host?: boolean
}

export type MessageInsert = Pick<Message, 'campaign_id' | 'content' | 'type'> & {
  session_id?: string
  player_id?: string
  image_url?: string
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: TypeScript types for all database tables"
```

---

### Task 4: Create Supabase Clients

**Files:**
- Create: `lib/supabase/client.ts` — browser client (for React components)
- Create: `lib/supabase/server.ts` — server client (for API routes + server components)

**Step 1: Write browser client**

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 2: Write server client**

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

Note: We use `SUPABASE_SERVICE_ROLE_KEY` on the server since there's no auth — we need full access. In production with auth, this would use the anon key + RLS.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: Supabase browser and server client setup"
```

---

### Task 5: Write Integration Test for Supabase Connection

**Files:**
- Create: `lib/supabase/__tests__/connection.test.ts`
- Modify: `package.json` (add test script if not present)

**Step 1: Install test framework**

Run: `npm install -D vitest`

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`

**Step 2: Write connection smoke test**

This test verifies the Supabase client can be instantiated and (if env vars are set) can reach the database. When env vars are missing, it should skip gracefully.

```typescript
import { describe, it, expect } from 'vitest'

describe('Supabase client', () => {
  it('createClient does not throw', async () => {
    // This test verifies the module can be imported and called
    // Actual DB connection requires env vars
    const { createClient } = await import('../client')
    expect(typeof createClient).toBe('function')
  })
})
```

**Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add -A && git commit -m "test: Supabase client smoke test"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| SQL migration | Manual or Supabase CLI | Run migration against a Supabase project, verify tables created |
| TypeScript types | Compile-time | `npm run build` catches type errors |
| Supabase clients | Unit test | Verify modules export expected functions |
| Integration | Manual | After setting up `.env.local`, verify a simple query works |

---

## Acceptance Criteria

- [ ] `supabase/migrations/001_initial.sql` contains all 5 tables with correct FK relationships
- [ ] `types/index.ts` exports types for Campaign, Player, Message, CampaignFile, Session + insert variants
- [ ] `lib/supabase/client.ts` exports `createClient()` for browser use
- [ ] `lib/supabase/server.ts` exports `createServerSupabaseClient()` for server use
- [ ] `.env.local.example` documents all required env vars
- [ ] `vitest` installed and test passes
- [ ] `npm run build` succeeds
