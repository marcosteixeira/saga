# PR 05: AI World Generation (Claude + Memory Files)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Claude Sonnet 4.6 into campaign creation to generate WORLD.md from the host's world description. Establish the campaign memory file system (campaign_files table) with CRUD operations.

**Architecture:** When a campaign is created, the API calls Claude to generate structured world lore from the host's description. The result is stored as a `WORLD.md` entry in `campaign_files`. A `lib/memory.ts` module provides CRUD for all campaign memory files. The campaign creation form now shows a loading state while AI generates content, then displays a preview.

**Tech Stack:** `@anthropic-ai/sdk`, Claude Sonnet 4.6, Supabase

**Depends on:** PR 04

---

## Design System Reference

All UI work in this PR must follow the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

**Applicable to this PR:**

- **Loading state ("Generating your world..."):** Use the piston animation as the primary loader. Display message in `Rokkitt`, uppercase, `--steam` color. Ambient smoke blobs can drift across the background during the wait.
- **`WorldPreview` card:** Iron Plate panel — `--smog` at 85% opacity, `--gunmetal` border, corner rivets. Campaign name as H1 (`Rokkitt`, uppercase, `--brass` with warm glow text-shadow).
- **World content text:** `Barlow Condensed` body font, `--steam` color, `line-height: 1.6`. Use `--ash` for section sub-headings.
- **Scroll area:** Minimal scrollbar styled with `--gunmetal` track and `--brass` thumb.
- **"Enter Lobby" button:** Primary button — `--brass` bg, chamfered corners, hover → `--furnace`.
- **Page transition into preview:** Steam burst + fade when switching from form to preview state.

---

### Task 1: Install Anthropic SDK

**Step 1: Install**

Run: `yarn add @anthropic-ai/sdk`

**Step 2: Create Anthropic client**

Create: `lib/anthropic.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: install Anthropic SDK and create client"
```

---

### Task 2: Build Campaign Memory File CRUD

**Files:**
- Create: `lib/memory.ts`
- Create: `lib/__tests__/memory.test.ts`

**Spec:**

`lib/memory.ts` provides functions for reading and writing campaign memory files:

```typescript
// Read a single file by campaign ID and filename
getCampaignFile(campaignId: string, filename: string): Promise<string | null>

// Read all files for a campaign
getCampaignFiles(campaignId: string): Promise<CampaignFile[]>

// Upsert a file (create or update)
upsertCampaignFile(campaignId: string, filename: string, content: string): Promise<void>

// Initialize default files for a new campaign (WORLD, CHARACTERS, NPCS, LOCATIONS, MEMORY)
initializeCampaignFiles(campaignId: string, worldContent: string): Promise<void>
```

The `initializeCampaignFiles` function creates all 5 base files:
- `WORLD.md` — populated with the Claude-generated content
- `CHARACTERS.md` — empty, populated as players join
- `NPCS.md` — empty, populated during gameplay
- `LOCATIONS.md` — empty, populated during gameplay
- `MEMORY.md` — seeded with a brief "Campaign just started" note

**Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom }))
}))

describe('memory', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('getCampaignFile', () => {
    it('returns file content when found', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { content: '# World\nA dark realm...' },
                error: null
              })
            })
          })
        })
      })

      const { getCampaignFile } = await import('../memory')
      const result = await getCampaignFile('camp-1', 'WORLD.md')
      expect(result).toBe('# World\nA dark realm...')
    })

    it('returns null when file not found', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' }
              })
            })
          })
        })
      })

      const { getCampaignFile } = await import('../memory')
      const result = await getCampaignFile('camp-1', 'MISSING.md')
      expect(result).toBeNull()
    })
  })

  describe('upsertCampaignFile', () => {
    it('calls upsert with correct data', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      mockFrom.mockReturnValue({ upsert: mockUpsert })

      const { upsertCampaignFile } = await import('../memory')
      await upsertCampaignFile('camp-1', 'WORLD.md', '# New content')

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_id: 'camp-1',
          filename: 'WORLD.md',
          content: '# New content'
        }),
        expect.any(Object)
      )
    })
  })

  describe('initializeCampaignFiles', () => {
    it('creates all 5 base files', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      mockFrom.mockReturnValue({ upsert: mockUpsert })

      const { initializeCampaignFiles } = await import('../memory')
      await initializeCampaignFiles('camp-1', '# Generated World')

      // Should be called for each of the 5 files
      expect(mockUpsert).toHaveBeenCalledTimes(5)
    })
  })
})
```

**Step 2: Run tests — verify they fail**

```bash
yarn test lib/__tests__/memory
```

Expected: FAIL — `Cannot find module '../memory'`

**Step 3: Implement `lib/memory.ts`**

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { CampaignFile } from '@/types'

export async function getCampaignFile(
  campaignId: string,
  filename: string
): Promise<string | null> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('campaign_files')
    .select('content')
    .eq('campaign_id', campaignId)
    .eq('filename', filename)
    .single()
  if (error || !data) return null
  return data.content
}

export async function getCampaignFiles(campaignId: string): Promise<CampaignFile[]> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('campaign_files')
    .select('*')
    .eq('campaign_id', campaignId)
  return data ?? []
}

export async function upsertCampaignFile(
  campaignId: string,
  filename: string,
  content: string
): Promise<void> {
  const supabase = createServerSupabaseClient()
  await supabase
    .from('campaign_files')
    .upsert(
      { campaign_id: campaignId, filename, content },
      { onConflict: 'campaign_id,filename' }
    )
}

export async function initializeCampaignFiles(
  campaignId: string,
  worldContent: string
): Promise<void> {
  const supabase = createServerSupabaseClient()
  const files = [
    { campaign_id: campaignId, filename: 'WORLD.md', content: worldContent },
    { campaign_id: campaignId, filename: 'CHARACTERS.md', content: '' },
    { campaign_id: campaignId, filename: 'NPCS.md', content: '' },
    { campaign_id: campaignId, filename: 'LOCATIONS.md', content: '' },
    { campaign_id: campaignId, filename: 'MEMORY.md', content: 'Campaign just started.' },
  ]
  for (const file of files) {
    await supabase
      .from('campaign_files')
      .upsert(file, { onConflict: 'campaign_id,filename' })
  }
}
```

**Step 4: Run tests — verify they pass**

```bash
yarn test lib/__tests__/memory
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add lib/memory.ts lib/__tests__/memory.test.ts
git commit -m "feat: campaign memory file CRUD (lib/memory.ts)"
```

---

### Task 3: Build World Generation Prompt

**Files:**
- Create: `lib/prompts/world-gen.ts`
- Create: `lib/prompts/__tests__/world-gen.test.ts`

**Spec:**

Function `buildWorldGenPrompt(worldDescription: string): string` returns a prompt that instructs Claude to generate a structured WORLD.md document.

The prompt should instruct Claude to output Markdown with these sections:
- **World Name** — derived from the description
- **Overview** — 2-3 paragraph summary
- **History** — key historical events
- **Geography** — major regions and features
- **Factions** — political/social groups
- **Tone** — the feel of the world (dark, whimsical, etc.)
- **Current Situation** — what's happening now
- **Starting Hooks** — 2-3 adventure hooks for players

**Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest'
import { buildWorldGenPrompt } from '../world-gen'

describe('buildWorldGenPrompt', () => {
  it('includes the user description in the prompt', () => {
    const result = buildWorldGenPrompt('A dark medieval kingdom')
    expect(result).toContain('A dark medieval kingdom')
  })

  it('requests Markdown output with required sections', () => {
    const result = buildWorldGenPrompt('Any world')
    expect(result).toContain('World Name')
    expect(result).toContain('Overview')
    expect(result).toContain('History')
    expect(result).toContain('Geography')
    expect(result).toContain('Factions')
    expect(result).toContain('Starting Hooks')
  })
})
```

**Step 2: Run test — verify it fails**

```bash
yarn test lib/prompts/__tests__/world-gen
```

Expected: FAIL — `Cannot find module '../world-gen'`

**Step 3: Implement `lib/prompts/world-gen.ts`**

```typescript
export function buildWorldGenPrompt(worldDescription: string): string {
  return `You are a fantasy world-builder. Based on the description below, generate a rich WORLD.md document for a tabletop RPG campaign.

User's world description:
"${worldDescription}"

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
}
```

**Step 4: Run test — verify it passes**

```bash
yarn test lib/prompts/__tests__/world-gen
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add lib/prompts/world-gen.ts lib/prompts/__tests__/world-gen.test.ts
git commit -m "feat: world generation prompt builder"
```

---

### Task 4: Integrate World Generation into Campaign Creation

**Files:**
- Modify: `app/api/campaign/route.ts`
- Modify: `app/api/campaign/__tests__/route.test.ts`

**Updated flow for `POST /api/campaign`:**

1. Validate input (existing)
2. Insert campaign row (existing)
3. **NEW:** Call Claude with `buildWorldGenPrompt(world_description)` → get WORLD.md text
4. **NEW:** Call `initializeCampaignFiles(campaignId, worldMdContent)`
5. Return `{ id }` with status 201

The Claude call is non-streaming — we wait for the full response. Acceptable for campaign creation (one-time action, user sees loading screen).

**Step 1: Add tests for the new behavior**

Add to the existing test file (with mocks at top):

```typescript
vi.mock('@/lib/anthropic', () => ({
  anthropic: {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '# World\nGenerated content' }]
      })
    }
  }
}))

vi.mock('@/lib/memory', () => ({
  initializeCampaignFiles: vi.fn().mockResolvedValue(undefined)
}))

it('calls Claude and initializes campaign files on success', async () => {
  const { anthropic } = await import('@/lib/anthropic')
  const { initializeCampaignFiles } = await import('@/lib/memory')
  // ... POST with valid auth and body
  expect(anthropic.messages.create).toHaveBeenCalledOnce()
  expect(initializeCampaignFiles).toHaveBeenCalledWith(
    expect.any(String),
    '# World\nGenerated content'
  )
})
```

**Step 2: Run new test — verify it fails**

```bash
yarn test app/api/campaign/__tests__/route
```

Expected: new test FAIL

**Step 3: Update `app/api/campaign/route.ts`**

After the DB insert succeeds, add:

```typescript
import { anthropic } from '@/lib/anthropic'
import { buildWorldGenPrompt } from '@/lib/prompts/world-gen'
import { initializeCampaignFiles } from '@/lib/memory'

// After campaign insert:
const prompt = buildWorldGenPrompt(world_description)
const aiResponse = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  messages: [{ role: 'user', content: prompt }],
})
const worldContent = aiResponse.content
  .filter((b) => b.type === 'text')
  .map((b) => b.text)
  .join('')
await initializeCampaignFiles(campaign.id, worldContent)
```

**Step 4: Run all tests — verify all pass**

```bash
yarn test app/api/campaign/__tests__/route
```

Expected: all tests PASS

**Step 5: Commit**

```bash
git add app/api/campaign/route.ts app/api/campaign/__tests__/route.test.ts
git commit -m "feat: integrate Claude world generation into campaign creation"
```

---

### Task 5: Add World Preview to Campaign Creation UI

**Files:**
- Create: `components/campaign/WorldPreview.tsx`
- Modify: `components/campaign/WorldGenForm.tsx`

**Spec:**

After form submit:
1. Show loading: "Generating your world..." (piston animation, `Rokkitt` uppercase `--steam`)
2. On API response: fetch GET `/api/campaign/[id]` to load world files
3. Render `WorldPreview`:
   - Campaign name as H1 (`Rokkitt`, uppercase, `--brass` with glow)
   - WORLD.md content in scroll area (plain text, preserve line breaks)
   - "Enter Lobby" button → navigate to `/campaign/[id]/lobby`

**WorldPreview component:**
- Props: `campaign: Campaign`, `worldContent: string`
- Iron Plate panel — `--smog` 85% opacity, `--gunmetal` border
- `ScrollArea` for long content

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
      <h1 className="font-display text-4xl uppercase text-[--brass] mb-6"
          style={{ textShadow: '0 0 20px rgba(196,148,61,0.4)' }}>
        {campaign.name}
      </h1>
      <ScrollArea className="h-96 mb-6">
        <pre className="font-body text-[--steam] text-sm leading-relaxed whitespace-pre-wrap">
          {worldContent}
        </pre>
      </ScrollArea>
      <Button className="w-full" onClick={() => router.push(`/campaign/${campaign.id}/lobby`)}>
        Enter Lobby
      </Button>
    </div>
  )
}
```

**Step 3: Update `WorldGenForm.tsx` to show preview after creation**

Add states: `isGenerating` (bool), `preview` (`{ campaign, worldContent } | null`).

After successful POST response:
1. Set `isGenerating = true`
2. Fetch GET `/api/campaign/${id}` to get the world file
3. Set `preview = { campaign, worldContent }` and `isGenerating = false`

Render: if `preview` → `<WorldPreview />`. If `isGenerating` → loading message. Else → form.

**Step 4: Visual test**

- Fill form → submit → "Generating your world..." spinner
- World preview appears with campaign name + WORLD.md content
- Long descriptions scroll within the card
- "Enter Lobby" navigates correctly

**Step 5: Commit**

```bash
git add components/campaign/WorldPreview.tsx components/campaign/WorldGenForm.tsx
git commit -m "feat: world preview after campaign creation"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| lib/memory.ts | Unit test (vitest) | 4 tests: getCampaignFile (found/not found), upsertCampaignFile, initializeCampaignFiles |
| lib/prompts/world-gen.ts | Unit test (vitest) | 2 tests: includes description, includes required sections |
| POST /api/campaign (updated) | Unit test (vitest) | Existing tests + 1 new for Claude integration |
| WorldPreview component | Visual/manual | Renders campaign name, world content, scroll works |
| End-to-end creation flow | Visual/manual | Form → loading → preview → lobby redirect |

---

## Acceptance Criteria

- [ ] `lib/memory.ts` provides getCampaignFile, getCampaignFiles, upsertCampaignFile, initializeCampaignFiles (4 tests passing)
- [ ] `lib/prompts/world-gen.ts` builds a structured prompt (2 tests passing)
- [ ] Campaign creation now calls Claude to generate WORLD.md (test passing)
- [ ] All 5 campaign files initialized after creation
- [ ] WorldPreview component displays generated world content
- [ ] Loading state shown during AI generation
- [ ] `yarn build` succeeds
