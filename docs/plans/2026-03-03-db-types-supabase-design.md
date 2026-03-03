# Design: PR 03 — Database Schema + Types + Supabase Clients

_Created: 2026-03-03_

## Goal

Set up the Supabase database schema, TypeScript types, and client libraries — the data foundation everything else builds on.

## Supabase Project

- **URL:** `https://pgrkfqflgjrulgrekqir.supabase.co`
- **Key format:** New Supabase secret API keys (`sb_publishable_...` / `sb_secret_...`)
- **RLS:** Disabled for MVP (no auth)

## Tasks

### 1. Install Dependencies
- `yarn add @supabase/supabase-js @supabase/ssr`
- Create `.env.local.example` with all required env vars
- Ensure `.env.local` is in `.gitignore`

### 2. Database Migration
File: `supabase/migrations/001_initial.sql`

Tables in FK-safe creation order:
1. `campaigns` — root table
2. `sessions` — references campaigns
3. `players` — references campaigns
4. `messages` — references campaigns, sessions, players
5. `campaign_files` — references campaigns

Indexes:
- `players.campaign_id`
- `messages(campaign_id, created_at)`
- `campaign_files.campaign_id`
- `sessions.campaign_id`

Migration run against live Supabase project.

### 3. TypeScript Types
One file per table, re-exported from `types/index.ts`:

```
types/
├── campaign.ts
├── player.ts
├── message.ts
├── campaign-file.ts
├── session.ts
└── index.ts
```

Each file exports a row type + insert type for its table.

### 4. Supabase Clients
- `lib/supabase/client.ts` — browser client (anon key)
- `lib/supabase/server.ts` — server client (service role key, for API routes)

### 5. Smoke Test
- Install `vitest`
- `lib/supabase/__tests__/connection.test.ts` — verifies `createClient` exports correctly
- `yarn build` must pass

## Acceptance Criteria
- [ ] All 5 tables created in Supabase with correct FK relationships
- [ ] `types/` has one file per table + barrel `index.ts`
- [ ] Browser and server clients implemented
- [ ] `.env.local.example` documents all env vars
- [ ] Vitest installed and smoke test passes
- [ ] `yarn build` succeeds
