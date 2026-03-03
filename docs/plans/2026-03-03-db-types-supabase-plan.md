# Database Schema + Types + Supabase Clients Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Supabase database schema, TypeScript types, and client libraries — the data foundation everything else builds on.

**Architecture:** Supabase Postgres for persistence. All tables defined in a single migration run against the live project. TypeScript types mirror the DB schema exactly, one file per table. Server client uses service role key (no auth/RLS for MVP).

**Tech Stack:** Supabase (Postgres), `@supabase/supabase-js`, `@supabase/ssr`, TypeScript, Vitest

---

### Task 1: Install Supabase Dependencies

**Files:**
- Modify: `package.json`
- Create: `.env.local.example`

**Step 1: Install packages**

Run:
```bash
yarn add @supabase/supabase-js @supabase/ssr
```

Expected: packages added to `dependencies` in `package.json`.

**Step 2: Create `.env.local.example`**

Create `.env.local.example` at project root:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

**Step 3: Verify `.env.local` is gitignored**

Run:
```bash
cat .gitignore | grep .env.local
```

Expected: `.env.local` appears. If not, add it.

**Step 4: Commit**

```bash
git add package.json yarn.lock .env.local.example
git commit -m "chore: install Supabase dependencies and env template"
```

---

### Task 2: Write Database Migration

**Files:**
- Create: `supabase/migrations/001_initial.sql`

**Step 1: Create the directory**

```bash
mkdir -p supabase/migrations
```

**Step 2: Write the migration**

Create `supabase/migrations/001_initial.sql`:

```sql
-- campaigns (root table — must be first)
CREATE TABLE campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  host_username       TEXT NOT NULL,
  host_session_token  UUID NOT NULL,
  world_description   TEXT NOT NULL,
  system_description  TEXT,
  cover_image_url     TEXT,
  map_image_url       TEXT,
  status              TEXT DEFAULT 'lobby',
  turn_mode           TEXT DEFAULT 'free',
  turn_timer_seconds  INT DEFAULT 60,
  current_session_id  UUID,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- sessions (referenced by messages — must be before messages)
CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_number      INT NOT NULL,
  present_player_ids  UUID[] DEFAULT '{}',
  summary_md          TEXT,
  started_at          TIMESTAMPTZ DEFAULT now(),
  ended_at            TIMESTAMPTZ
);

-- players
CREATE TABLE players (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_token         UUID NOT NULL,
  username              TEXT NOT NULL,
  character_name        TEXT,
  character_class       TEXT,
  character_backstory   TEXT,
  character_image_url   TEXT,
  stats                 JSONB DEFAULT '{"hp": 20, "hp_max": 20}',
  status                TEXT DEFAULT 'active',
  absence_mode          TEXT DEFAULT 'skip',
  is_host               BOOLEAN DEFAULT false,
  last_seen_at          TIMESTAMPTZ DEFAULT now(),
  joined_at             TIMESTAMPTZ DEFAULT now()
);

-- messages (references sessions + players — must be last of these three)
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES sessions(id),
  player_id     UUID REFERENCES players(id),
  content       TEXT NOT NULL,
  image_url     TEXT,
  type          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- campaign_files (memory system)
CREATE TABLE campaign_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (campaign_id, filename)
);

-- Indexes for common query patterns
CREATE INDEX idx_players_campaign_id ON players(campaign_id);
CREATE INDEX idx_messages_campaign_created ON messages(campaign_id, created_at);
CREATE INDEX idx_campaign_files_campaign_id ON campaign_files(campaign_id);
CREATE INDEX idx_sessions_campaign_id ON sessions(campaign_id);
```

**Step 3: Run migration against Supabase**

Go to your Supabase dashboard → **SQL Editor** → paste the full SQL above → click **Run**.

Expected: "Success. No rows returned." All 5 tables visible in **Table Editor**.

**Step 4: Commit**

```bash
git add supabase/migrations/001_initial.sql
git commit -m "feat: initial database migration with all tables"
```

---

### Task 3: Define TypeScript Types

**Files:**
- Create: `types/campaign.ts`
- Create: `types/player.ts`
- Create: `types/message.ts`
- Create: `types/campaign-file.ts`
- Create: `types/session.ts`
- Create: `types/index.ts`

**Step 1: Create `types/campaign.ts`**

```typescript
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

export type CampaignInsert = Pick<
  Campaign,
  'name' | 'host_username' | 'host_session_token' | 'world_description'
> & {
  system_description?: string
}
```

**Step 2: Create `types/player.ts`**

```typescript
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

export type PlayerInsert = Pick<
  Player,
  'campaign_id' | 'session_token' | 'username'
> & {
  character_name?: string
  character_class?: string
  character_backstory?: string
  is_host?: boolean
}
```

**Step 3: Create `types/message.ts`**

```typescript
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

export type MessageInsert = Pick<Message, 'campaign_id' | 'content' | 'type'> & {
  session_id?: string
  player_id?: string
  image_url?: string
}
```

**Step 4: Create `types/campaign-file.ts`**

```typescript
export type CampaignFile = {
  id: string
  campaign_id: string
  filename: string
  content: string
  updated_at: string
}

export type CampaignFileInsert = Pick<
  CampaignFile,
  'campaign_id' | 'filename'
> & {
  content?: string
}
```

**Step 5: Create `types/session.ts`**

```typescript
export type Session = {
  id: string
  campaign_id: string
  session_number: number
  present_player_ids: string[]
  summary_md: string | null
  started_at: string
  ended_at: string | null
}

export type SessionInsert = Pick<
  Session,
  'campaign_id' | 'session_number'
> & {
  present_player_ids?: string[]
}
```

**Step 6: Create `types/index.ts`**

```typescript
export type { Campaign, CampaignInsert } from './campaign'
export type { Player, PlayerInsert } from './player'
export type { Message, MessageInsert } from './message'
export type { CampaignFile, CampaignFileInsert } from './campaign-file'
export type { Session, SessionInsert } from './session'
```

**Step 7: Verify types compile**

Run:
```bash
yarn build
```

Expected: build succeeds with no type errors.

**Step 8: Commit**

```bash
git add types/
git commit -m "feat: TypeScript types for all database tables"
```

---

### Task 4: Create Supabase Clients

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

**Step 1: Create directory**

```bash
mkdir -p lib/supabase
```

**Step 2: Create `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 3: Create `lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
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

Note: `SUPABASE_SERVICE_ROLE_KEY` gives full DB access on the server. Safe here because no auth/RLS for MVP — the key never reaches the browser.

**Step 4: Verify build**

Run:
```bash
yarn build
```

Expected: no errors.

**Step 5: Commit**

```bash
git add lib/supabase/
git commit -m "feat: Supabase browser and server clients"
```

---

### Task 5: Smoke Test + Final Verification

**Files:**
- Create: `lib/supabase/__tests__/connection.test.ts`
- Modify: `package.json`

**Step 1: Install Vitest**

Run:
```bash
yarn add -D vitest
```

**Step 2: Add test scripts to `package.json`**

Add to the `scripts` section:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Create `lib/supabase/__tests__/connection.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'

describe('Supabase client', () => {
  it('createClient is a function', async () => {
    const { createClient } = await import('../client')
    expect(typeof createClient).toBe('function')
  })

  it('createServerSupabaseClient is a function', async () => {
    const { createServerSupabaseClient } = await import('../server')
    expect(typeof createServerSupabaseClient).toBe('function')
  })
})
```

**Step 4: Run tests**

Run:
```bash
yarn test
```

Expected: 2 tests pass.

**Step 5: Final build check**

Run:
```bash
yarn build
```

Expected: build succeeds.

**Step 6: Commit**

```bash
git add lib/supabase/__tests__/ package.json yarn.lock
git commit -m "test: Supabase client smoke tests"
```

---

## Acceptance Criteria

- [ ] `supabase/migrations/001_initial.sql` — all 5 tables with correct FK order + indexes
- [ ] Migration applied to live Supabase project (tables visible in dashboard)
- [ ] `types/` — one file per table + barrel `index.ts`
- [ ] `lib/supabase/client.ts` — exports `createClient()`
- [ ] `lib/supabase/server.ts` — exports `createServerSupabaseClient()`
- [ ] `.env.local.example` — all 5 env vars documented
- [ ] `yarn test` — 2 tests pass
- [ ] `yarn build` — succeeds
