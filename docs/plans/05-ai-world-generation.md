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

Run: `npx vitest run lib/__tests__/memory`

**Step 3: Implement `lib/memory.ts`**

**Step 4: Run tests — verify they pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: campaign memory file CRUD (lib/memory.ts)"
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

**Step 2: Run test — fail**

**Step 3: Implement**

Pure function that returns a string. No API calls — just prompt construction.

**Step 4: Run test — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: world generation prompt builder"
```

---

### Task 4: Integrate World Generation into Campaign Creation

**Files:**
- Modify: `app/api/campaign/route.ts`

**Updated flow for `POST /api/campaign`:**

1. Validate input (existing)
2. Insert campaign row (existing)
3. **NEW:** Call Claude with world-gen prompt → get WORLD.md content
4. **NEW:** Call `initializeCampaignFiles(campaignId, worldMdContent)`
5. Return `{ id, host_session_token }` with status 201

The Claude call is non-streaming (we wait for the full response). This is acceptable because campaign creation is a one-time action and the user sees a loading screen.

**Step 1: Update existing tests**

Add a test that verifies Claude is called and campaign files are initialized:

```typescript
it('generates WORLD.md via Claude and initializes campaign files', async () => {
  // Mock Claude response
  // Mock initializeCampaignFiles
  // Verify both are called after campaign insert
})
```

**Step 2: Run tests — verify new test fails**

**Step 3: Update the route implementation**

Add Claude call after DB insert. Pass `world_description` to `buildWorldGenPrompt()`, call `anthropic.messages.create()`, extract the text content, then call `initializeCampaignFiles()`.

**Step 4: Run tests — all pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: integrate Claude world generation into campaign creation"
```

---

### Task 5: Add World Preview to Campaign Creation UI

**Files:**
- Create: `components/campaign/WorldPreview.tsx`
- Modify: `components/campaign/WorldGenForm.tsx`
- Modify: `app/campaign/new/page.tsx`

**Spec:**

After the campaign is created (and WORLD.md generated), show a preview page before redirecting to the lobby:

1. Form submits → loading spinner with "Generating your world..." message
2. On success: fetch the campaign data (GET /api/campaign/[id]) including WORLD.md
3. Display WorldPreview:
   - Campaign name as heading
   - WORLD.md content rendered as formatted text (Markdown-ish, but plain rendering is fine for now)
   - "Enter Lobby" button → navigates to `/campaign/[id]/lobby`

**WorldPreview component:**
- Props: `campaign: Campaign`, `worldContent: string`
- Renders in a card with dark fantasy styling
- Scroll area for long world descriptions

**Step 1: Add shadcn scroll-area component**

Run: `npx shadcn@latest add scroll-area`

**Step 2: Implement WorldPreview**

**Step 3: Update WorldGenForm to show preview after creation**

Add a state: `createdCampaign`. After successful POST, fetch campaign data and set state. Conditionally render either the form or the preview.

**Step 4: Visual test**

- Fill form → submit → "Generating your world..." spinner
- After generation: world preview appears with campaign name and WORLD.md content
- "Enter Lobby" button navigates to lobby
- Long world descriptions scroll within the card

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: world preview after campaign creation"
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
