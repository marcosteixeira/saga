# PR 05: AI World Generation (Claude + Memory Files)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate WORLD.md via Claude when a campaign is created, without blocking the HTTP response or hitting Vercel timeouts.

**Architecture:** `POST /api/campaign` inserts a row with `status: 'generating'` and returns `{ id }` immediately. A Supabase Database Webhook fires on that INSERT and calls a Supabase Edge Function (`generate-world`). The Edge Function calls Claude, writes campaign files, and updates `status → 'lobby'`. Supabase Realtime (Postgres Changes) delivers the status update to the browser automatically — the Edge Function does not need to broadcast manually. The campaign creation UI subscribes to that Postgres Changes event and shows `WorldPreview` when `status` becomes `'lobby'`, or an error state when it becomes `'error'`.

**Tech Stack:** `@anthropic-ai/sdk`, Claude Sonnet 4.6, Supabase Edge Functions (Deno), Supabase DB Webhooks, Supabase Realtime Postgres Changes, Row Level Security

**Depends on:** PR 04

---

## Design System Reference

All UI work must follow the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

**Applicable to this PR:**
- **Loading state ("Generating your world..."):** Piston animation. Text in `Rokkitt`, uppercase, `--steam`. Ambient smoke blobs drifting in background.
- **`WorldPreview` card:** Iron Plate panel — `--smog` 85% opacity, `--gunmetal` border, corner rivets. Campaign name H1 (`Rokkitt`, uppercase, `--brass`, warm glow text-shadow).
- **World content text:** `Barlow Condensed`, `--steam`, `line-height: 1.6`. `--ash` for section sub-headings.
- **Scroll area:** `--gunmetal` track, `--brass` thumb.
- **"Enter Lobby" button:** `--brass` bg, chamfered corners, hover → `--furnace`.
- **Page transition:** Steam burst + fade from loading to preview.
- **Error state:** `--furnace` border, `--ash` text: "World generation failed. Try again." Retry button in standard secondary style.

---

### Task 1: Install Anthropic SDK and Create Client

Already done. Verify:

```bash
yarn test lib/__tests__/memory && yarn test lib/prompts/__tests__/world-gen
```

Expected: 7 tests passing. If any fail, fix before proceeding.

---

### Task 2: Add Campaign Status Values + Realtime + RLS

**Why this task exists:**
- `'generating'` and `'error'` must be valid status values (TypeScript + documented in DB)
- Supabase Realtime Postgres Changes only fires for tables explicitly added to the `supabase_realtime` publication — off by default
- RLS must be enabled with a SELECT policy, otherwise Postgres Changes events are silently dropped on the client even if Realtime is enabled

**Files:**
- Create: `supabase/migrations/003_world_generation_setup.sql`
- Modify: `types/campaign.ts`

**Step 1: Write migration**

Create `supabase/migrations/003_world_generation_setup.sql`:

```sql
-- Document new status values (status is plain TEXT, no enum to alter)
COMMENT ON COLUMN campaigns.status IS
  'generating | error | lobby | active | paused | ended';

-- Enable Realtime Postgres Changes for campaigns table.
-- Without this, client subscriptions to campaigns UPDATE events never fire.
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;

-- Enable Row Level Security.
-- Without RLS policies, Postgres Changes events are silently dropped on the client.
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Host can read their own campaign (required for Realtime to deliver events)
CREATE POLICY "host can read own campaign"
  ON campaigns FOR SELECT
  USING (auth.uid() = host_user_id);

-- Host can update their own campaign
CREATE POLICY "host can update own campaign"
  ON campaigns FOR UPDATE
  USING (auth.uid() = host_user_id);

-- Anyone authenticated can insert a campaign (they become the host)
CREATE POLICY "authenticated users can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (auth.uid() = host_user_id);
```

**Step 2: Apply migration**

```bash
supabase db push
```

**Step 3: Update TypeScript type**

In `types/campaign.ts`, update the status union:

```typescript
status: 'generating' | 'error' | 'lobby' | 'active' | 'paused' | 'ended'
```

**Step 4: Verify build compiles**

```bash
yarn build
```

Expected: no TypeScript errors.

**Step 5: Commit**

```bash
git add supabase/migrations/003_world_generation_setup.sql types/campaign.ts
git commit -m "feat: campaign Realtime, RLS policies, and generating/error status"
```

---

### Task 3: Update Campaign Creation Route

**Files:**
- Modify: `app/api/campaign/route.ts`
- Modify: `app/api/campaign/__tests__/route.test.ts`

**What changes:** Remove the Claude call entirely from this route. Insert with `status: 'generating'`. Return `{ id }` immediately. The Supabase DB Webhook + Edge Function handle the rest asynchronously.

**Step 1: Update the test file**

Replace the entire `app/api/campaign/__tests__/route.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
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

  it('inserts campaign with status generating — no Claude call in this route', async () => {
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

**Step 2: Run tests — verify the new status test fails**

```bash
yarn test app/api/campaign/__tests__/route
```

Expected: `inserts campaign with status generating` FAIL (route currently inserts `'lobby'` and calls Claude).

**Step 3: Update `app/api/campaign/route.ts`**

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

  return NextResponse.json({ id: data.id }, { status: 201 })
}
```

**Step 4: Run all tests — verify they pass**

```bash
yarn test app/api/campaign/__tests__/route
```

Expected: PASS (6 tests).

**Step 5: Commit**

```bash
git add app/api/campaign/route.ts app/api/campaign/__tests__/route.test.ts
git commit -m "feat: campaign creation returns id immediately with status generating"
```

---

### Task 4: Build Supabase Edge Function `generate-world`

**Files:**
- Create: `supabase/functions/generate-world/index.ts`

**What it does:** Receives the Supabase DB Webhook payload (campaigns INSERT), calls Claude with the world description, writes all 5 campaign memory files, then updates `campaigns.status`:
- `'lobby'` on success → Realtime delivers this UPDATE to the subscribed client automatically
- `'error'` on failure → same delivery path, client shows error UI

**No manual broadcast needed.** The status column UPDATE is enough — the client's Postgres Changes subscription fires on any UPDATE to their campaign row.

**Webhook payload shape** (sent by Supabase Database Webhooks on INSERT):

```typescript
{
  type: 'INSERT',
  table: 'campaigns',
  schema: 'public',
  record: {
    id: string
    world_description: string
    system_description: string | null
    status: 'generating'
    // ...other columns
  },
  old_record: null
}
```

**Step 1: Create the Edge Function**

Create `supabase/functions/generate-world/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "jsr:@supabase/supabase-js@2"

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!  // service role bypasses RLS for server writes
)

Deno.serve(async (req: Request) => {
  // Validate webhook secret — prevents anyone from calling this directly
  const webhookSecret = Deno.env.get("GENERATE_WORLD_WEBHOOK_SECRET")
  const authHeader = req.headers.get("authorization")
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const payload = await req.json()
  const campaign = payload.record

  if (!campaign?.id || !campaign?.world_description) {
    return new Response("Invalid payload", { status: 400 })
  }

  try {
    // Prompt injection defense: user content in user message, never in system
    const systemPrompt = `You are a fantasy world-builder. Generate a rich WORLD.md document for a tabletop RPG campaign based on the player's description.

Output a Markdown document with exactly these sections (use ## headings):
## World Name
## Overview
## History
## Geography
## Factions
## Tone
## Current Situation
## Starting Hooks

Be evocative and specific. Starting Hooks must list 2-3 adventure hooks players can immediately pursue. Output ONLY the Markdown document, no preamble.`

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: campaign.world_description }],
    })

    const worldContent = aiResponse.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")

    // Initialize all 5 campaign memory files
    const files = [
      { campaign_id: campaign.id, filename: "WORLD.md", content: worldContent },
      { campaign_id: campaign.id, filename: "CHARACTERS.md", content: "" },
      { campaign_id: campaign.id, filename: "NPCS.md", content: "" },
      { campaign_id: campaign.id, filename: "LOCATIONS.md", content: "" },
      { campaign_id: campaign.id, filename: "MEMORY.md", content: "Campaign just started." },
    ]
    for (const file of files) {
      await supabase
        .from("campaign_files")
        .upsert(file, { onConflict: "campaign_id,filename" })
    }

    // Update status → 'lobby'.
    // Supabase Realtime Postgres Changes delivers this UPDATE to the subscribed
    // browser client automatically — no manual broadcast needed.
    await supabase
      .from("campaigns")
      .update({ status: "lobby" })
      .eq("id", campaign.id)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("generate-world failed:", err)

    // Update status → 'error'.
    // Same Realtime path delivers this to the client — error UI is shown.
    await supabase
      .from("campaigns")
      .update({ status: "error" })
      .eq("id", campaign.id)

    return new Response("Generation failed", { status: 500 })
  }
})
```

**Step 2: Deploy the Edge Function**

```bash
supabase functions deploy generate-world --no-verify-jwt
```

`--no-verify-jwt`: this function is called by Supabase's webhook infrastructure, not by a user JWT. The `GENERATE_WORLD_WEBHOOK_SECRET` header check is the auth mechanism.

**Step 3: Set Edge Function secrets**

```bash
supabase secrets set ANTHROPIC_API_KEY=<your-key>
supabase secrets set GENERATE_WORLD_WEBHOOK_SECRET=<random-strong-string>
```

**Step 4: Configure the Database Webhook**

Go to: **Supabase Dashboard → Database → Webhooks → Create new webhook**

| Setting | Value |
|---------|-------|
| Name | `generate-world` |
| Table | `campaigns` |
| Events | `INSERT` |
| Webhook URL | `https://<project-ref>.supabase.co/functions/v1/generate-world` |
| HTTP Headers | `Authorization: Bearer <GENERATE_WORLD_WEBHOOK_SECRET>` |

Document these steps in `docs/supabase-setup.md` so future developers can recreate the webhook.

**Step 5: Test the Edge Function locally**

```bash
supabase functions serve generate-world
```

In a separate terminal, insert a campaign row and curl the function with a fake webhook payload:

```bash
curl -X POST http://localhost:54321/functions/v1/generate-world \
  -H "Authorization: Bearer <GENERATE_WORLD_WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "campaigns",
    "record": {
      "id": "<a-real-campaign-uuid-from-your-local-db>",
      "world_description": "A dark steampunk empire where machines have replaced magic",
      "system_description": null,
      "status": "generating"
    }
  }'
```

Verify in Supabase Studio (Table Editor):
- `campaign_files` has 5 rows for that campaign
- `campaigns.status` is `'lobby'`

**Step 6: Commit**

```bash
git add supabase/functions/generate-world/index.ts
git commit -m "feat: generate-world Edge Function — Claude world gen triggered by DB webhook"
```

---

### Task 5: Add World Preview to Campaign Creation UI

**Files:**
- Create: `components/campaign/WorldPreview.tsx`
- Modify: `components/campaign/WorldGenForm.tsx`

**How the UI reacts to generation:**

The Postgres Changes subscription on the `campaigns` table fires automatically when the Edge Function updates `status`. The client only needs to:
1. Subscribe after getting the campaign `id`
2. Handle the `UPDATE` event — check `payload.new.status`
3. On `'lobby'`: fetch `/api/campaign/${id}` (which returns `files`), extract `WORLD.md`, show preview
4. On `'error'`: show error state with retry

**GET `/api/campaign/[id]`** already returns `{ campaign, players, files }` where `files` is the full `campaign_files` array. Extract `WORLD.md` with:
```typescript
const worldFile = files.find(f => f.filename === 'WORLD.md')
const worldContent = worldFile?.content ?? ''
```

**State machine for `WorldGenForm`:**

```typescript
type FormState = 'idle' | 'submitting' | 'generating' | 'ready' | 'error'
```

**Step 1: Install scroll-area shadcn component**

```bash
npx shadcn@latest add scroll-area
```

**Step 2: Implement `components/campaign/WorldPreview.tsx`**

```typescript
'use client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import type { Campaign } from '@/types'

interface Props {
  campaign: Campaign
  worldContent: string
}

export function WorldPreview({ campaign, worldContent }: Props) {
  const router = useRouter()
  return (
    <div className="rounded border border-[--gunmetal] bg-[--smog]/85 p-8 max-w-2xl mx-auto">
      <h1
        className="font-display text-4xl uppercase text-[--brass] mb-6"
        style={{ textShadow: '0 0 20px rgba(196,148,61,0.4)' }}
      >
        {campaign.name}
      </h1>
      <ScrollArea className="h-96 mb-6">
        <pre className="font-body text-[--steam] text-sm leading-relaxed whitespace-pre-wrap">
          {worldContent}
        </pre>
      </ScrollArea>
      <Button
        className="w-full"
        onClick={() => router.push(`/campaign/${campaign.id}/lobby`)}
      >
        Enter Lobby
      </Button>
    </div>
  )
}
```

**Step 3: Update `WorldGenForm.tsx`**

Add Realtime subscription logic after POST returns `{ id }`:

```typescript
'use client'
import { createClient } from '@/lib/supabase/client'  // browser Supabase client

type FormState = 'idle' | 'submitting' | 'generating' | 'ready' | 'error'

// Inside the component:
const [formState, setFormState] = useState<FormState>('idle')
const [preview, setPreview] = useState<{ campaign: Campaign; worldContent: string } | null>(null)

async function handleSubmit(formData: FormData) {
  setFormState('submitting')

  const res = await fetch('/api/campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formData.get('name'),
      world_description: formData.get('world_description'),
      host_username: formData.get('host_username'),
    }),
  })

  if (!res.ok) {
    setFormState('error')
    return
  }

  const { id } = await res.json()
  setFormState('generating')

  // Subscribe to Postgres Changes on this campaign row.
  // Fires automatically when the Edge Function updates campaigns.status.
  const supabase = createClient()
  const channel = supabase
    .channel(`campaign-status-${id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'campaigns',
        filter: `id=eq.${id}`,
      },
      async (payload) => {
        if (payload.new.status === 'lobby') {
          channel.unsubscribe()
          // Fetch campaign details + files
          const data = await fetch(`/api/campaign/${id}`).then(r => r.json())
          const worldContent = data.files.find(
            (f: { filename: string }) => f.filename === 'WORLD.md'
          )?.content ?? ''
          setPreview({ campaign: data.campaign, worldContent })
          setFormState('ready')
        }
        if (payload.new.status === 'error') {
          channel.unsubscribe()
          setFormState('error')
        }
      }
    )
    .subscribe()
}

// Render:
if (formState === 'ready' && preview) {
  return <WorldPreview campaign={preview.campaign} worldContent={preview.worldContent} />
}
if (formState === 'generating' || formState === 'submitting') {
  return <PistonLoader message="Generating your world..." />
}
if (formState === 'error') {
  return (
    <div>
      <p>World generation failed. Please try again.</p>
      <Button onClick={() => setFormState('idle')}>Try Again</Button>
    </div>
  )
}
// else: render the form
```

**Step 4: Visual test — happy path**

1. Fill form → submit
2. Immediately see piston animation "Generating your world..."
3. After 15–30s: steam burst transition → `WorldPreview` appears
4. "Enter Lobby" navigates to `/campaign/{id}/lobby`

**Step 5: Visual test — error path**

1. Temporarily set `ANTHROPIC_API_KEY` to an invalid value in Supabase secrets
2. Create a campaign → loading state appears
3. After a few seconds → error UI appears ("World generation failed. Please try again.")
4. Restore the key

**Step 6: Commit**

```bash
git add components/campaign/WorldPreview.tsx components/campaign/WorldGenForm.tsx
git commit -m "feat: async world preview via Supabase Realtime Postgres Changes"
```

---

## Environment Variables

The Edge Function reads secrets from Supabase (set via `supabase secrets set`). No new env vars are needed in the Next.js `.env.local`.

For local development, the Edge Function reads from `.env` in `supabase/functions/` or from `supabase/.env`. Create `supabase/.env` (gitignored):

```bash
ANTHROPIC_API_KEY=sk-ant-...
GENERATE_WORLD_WEBHOOK_SECRET=local-dev-secret
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| `lib/memory.ts` | Unit (vitest) | 4 tests — already passing |
| `lib/prompts/world-gen.ts` | Unit (vitest) | 3 tests — already passing |
| `POST /api/campaign` | Unit (vitest) | 6 tests: auth, validation, status=generating, no Claude call |
| `generate-world` Edge Function | Manual (`supabase functions serve`) | curl fake webhook payload, verify DB state |
| Realtime subscription + UI | Manual | Create campaign → watch piston loader → preview renders |
| Error path | Manual | Break API key → verify error state in UI |

---

## Acceptance Criteria

- [ ] `POST /api/campaign` inserts with `status: 'generating'`, returns `{ id }` immediately, never calls Claude (6 tests passing)
- [ ] `campaigns` table in Realtime publication — Postgres Changes fire on status UPDATE
- [ ] RLS policies: host can SELECT/UPDATE/INSERT own campaigns
- [ ] `generate-world` Edge Function deployed and callable
- [ ] DB Webhook configured: campaigns INSERT → `generate-world` Edge Function
- [ ] Edge Function calls Claude, initializes 5 campaign files, updates `status → 'lobby'`
- [ ] Edge Function updates `status → 'error'` on failure
- [ ] Client `WorldGenForm` subscribes to Postgres Changes on campaign row
- [ ] Preview shown when `status` becomes `'lobby'`
- [ ] Error UI shown when `status` becomes `'error'`
- [ ] `yarn build` succeeds
