# Gameplay AI Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate AI calls — lean world generation, eliminate start-campaign edge function, move world depth + opening scene into game-session first call.

**Architecture:** `generate-world` produces only Name/Classes/Overview/Geography. `start-campaign` edge function is deleted. The Next.js start route triggers campaign cover image directly. `game-session` first call generates History/Factions/Tone + opening scene in one OpenAI pass; those fields stay in the conversation chain and are never broadcast to clients.

**Tech Stack:** Vitest, TypeScript, Deno edge functions, OpenAI Responses API, Supabase

**Design doc:** `docs/plans/2026-03-06-gameplay-ai-consolidation.md`

---

### Task 1: Remove History/Factions/Tone from required world sections

**Files:**
- Modify: `supabase/functions/generate-world/world-content.ts`
- Modify: `supabase/functions/generate-world/__tests__/world-content.test.ts`

**Step 1: Update the failing test first**

In `world-content.test.ts`, update the fixture and assertions to reflect 4 required sections (not 7):

```typescript
// Update REQUIRED_WORLD_SECTIONS test
describe('REQUIRED_WORLD_SECTIONS', () => {
  it('contains exactly 4 sections', () => {
    expect(REQUIRED_WORLD_SECTIONS).toHaveLength(4)
  })

  it('does not include History', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## History')
  })

  it('does not include Factions', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## Factions')
  })

  it('does not include Tone', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## Tone')
  })
})
```

Also update the `VALID_WORLD_MD` fixture — remove the History, Factions, and Tone sections from it:

```typescript
const VALID_WORLD_MD = `
## World Name
Ironhold

## Overview
A dying empire...

## Geography
Mountains and fog...

## Classes
\`\`\`json
${VALID_CLASSES_JSON}
\`\`\`
`
```

Update every test that references this fixture to not include History/Factions/Tone.

**Step 2: Run tests to verify they fail**

```bash
yarn vitest supabase/functions/generate-world/__tests__/world-content.test.ts
```

Expected: FAIL — `REQUIRED_WORLD_SECTIONS` still has 7 entries.

**Step 3: Update `world-content.ts`**

```typescript
export const REQUIRED_WORLD_SECTIONS = [
  '## World Name',
  '## Overview',
  '## Geography',
  '## Classes',
] as const
```

**Step 4: Run tests to verify they pass**

```bash
yarn vitest supabase/functions/generate-world/__tests__/world-content.test.ts
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add supabase/functions/generate-world/world-content.ts supabase/functions/generate-world/__tests__/world-content.test.ts
git commit -m "feat: remove History/Factions/Tone from required world sections"
```

---

### Task 2: Remove History/Factions/Tone from generate-world system prompt

**Files:**
- Modify: `supabase/functions/generate-world/index.ts`

No new tests needed — the system prompt is a string constant. The world-content tests from Task 1 already verify the validation logic.

**Step 1: Update the system prompt constant in `generate-world/index.ts`**

Remove the `## History`, `## Factions`, and `## Tone` sections from the `systemPrompt` string inside the `Deno.serve` handler. The prompt currently lists all 7 sections with descriptions; remove those 3 entries.

The kept sections are:
- `## World Name` — One evocative name.
- `## Classes` — Exactly 6 character classes as JSON.
- `## Overview` — 2–3 sentences.
- `## Geography` — 4–6 bullet points.

**Step 2: Run full test suite**

```bash
yarn vitest
```

Expected: all PASS.

**Step 3: Commit**

```bash
git add supabase/functions/generate-world/index.ts
git commit -m "feat: remove History/Factions/Tone from world generation — moved to game-session"
```

---

### Task 3: Update campaign cover image to focus on characters

**Files:**
- Modify: `supabase/functions/generate-image/index.ts`
- Modify: `supabase/functions/generate-image/__tests__/index.test.ts`

**Step 1: Write a failing test for the new user prompt format**

In `generate-image/__tests__/index.test.ts`, add a test that the campaign `buildPrompt` includes character backstory:

```typescript
describe('buildPromptForCampaign', () => {
  it('includes character backstory in user prompt', async () => {
    const { buildPromptForCampaign } = await import('../index.ts')
    const players = [
      { character_name: 'Aria', character_class: 'Rogue', character_backstory: 'A former spy.' },
      { character_name: 'Brom', character_class: 'Fighter', character_backstory: null },
    ]
    const worldName = 'Ironhold'
    const worldContent = 'A dying empire...'
    const result = buildPromptForCampaign(worldName, worldContent, players)
    expect(result).toContain('A former spy.')
    expect(result).toContain('Aria (Rogue)')
    expect(result).toContain('Brom (Fighter)')
  })
})
```

Note: to make `buildPromptForCampaign` testable, you'll extract it as a named export (see Step 3).

**Step 2: Run the test to verify it fails**

```bash
yarn vitest supabase/functions/generate-image/__tests__/index.test.ts
```

Expected: FAIL — `buildPromptForCampaign` is not exported.

**Step 3: Extract and update the campaign prompt builder in `generate-image/index.ts`**

Extract the campaign user prompt building into a named export so it's testable, and update it:

```typescript
export function buildPromptForCampaign(
  worldName: string,
  worldContent: string,
  players: Array<{ character_name: string | null; character_class: string | null; character_backstory: string | null; username?: string | null }>
): string {
  const characterList = players
    .map((p) => {
      const name = p.character_name ?? p.username ?? 'Unknown'
      const cls = p.character_class ?? 'unknown class'
      const backstory = p.character_backstory ? `: ${p.character_backstory}` : ''
      return `- ${name} (${cls})${backstory}`
    })
    .join('\n')

  return `World: ${worldName}\n\n${worldContent}\n\nCharacters:\n${characterList}`
}
```

Update the `buildPrompt` function for `entityType === 'campaign'` to:
1. Also select `character_backstory` from the players query
2. Call `buildPromptForCampaign(world.name, world.world_content, players)`

Replace `SCENE_IMAGE_SYSTEM_PROMPT` with:

```typescript
const SCENE_IMAGE_SYSTEM_PROMPT = `You are a tabletop RPG character art generator. Generate a single widescreen (16:9 landscape) cinematic scene that will be used as a full-bleed UI background for a web application.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich atmospheric scene content — no large empty or black areas
- Depict each character as a distinct individual, visible and recognizable in the scene
- Show their class, equipment, and personality through their appearance and posture
- The LEFT third should have the primary focal point
- Add a subtle dark vignette along the bottom edge for UI text readability

VISUAL RULES:
- Do NOT include any text, titles, logos, labels, or typographic elements
- Use deep, rich atmospheric lighting with dramatic shadows
- Genre must be faithfully rendered: crime gets gritty urban realism, sci-fi gets cold tech aesthetics, fantasy gets painterly drama, horror gets dark texture
- Each character must feel unique and specific to their class and backstory

Output only the image.`
```

**Step 4: Run tests to verify they pass**

```bash
yarn vitest supabase/functions/generate-image/__tests__/index.test.ts
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add supabase/functions/generate-image/index.ts supabase/functions/generate-image/__tests__/index.test.ts
git commit -m "feat: campaign cover image focuses on individual characters with backstory"
```

---

### Task 4: Update Next.js start route — replace start-campaign with cover image trigger

**Files:**
- Modify: `app/api/campaign/[id]/start/route.ts`
- Modify or create: `app/api/campaign/[id]/start/__tests__/route.test.ts`

**Step 1: Write a failing test**

Check if a test file already exists for this route. If not, create `app/api/campaign/[id]/start/__tests__/route.test.ts`.

The test should verify that a `fetch` is made to `generate-image` (not `start-campaign`) after a successful start:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn().mockResolvedValue({ ok: true })
vi.stubGlobal('fetch', mockFetch)

// Mock Supabase and auth as needed (follow the pattern in existing route tests if any)

describe('POST /api/campaign/[id]/start', () => {
  it('triggers generate-image for campaign cover', async () => {
    // ... set up valid campaign + players ...
    // call the route handler
    const calls = mockFetch.mock.calls
    const imageCall = calls.find(([url]) => String(url).includes('generate-image'))
    expect(imageCall).toBeDefined()
    const body = JSON.parse(imageCall[1].body)
    expect(body).toEqual({
      entity_type: 'campaign',
      entity_id: expect.any(String),
      image_type: 'cover',
    })
  })

  it('does not call start-campaign', async () => {
    // ... set up valid campaign + players ...
    const calls = mockFetch.mock.calls
    const startCampaignCall = calls.find(([url]) => String(url).includes('start-campaign'))
    expect(startCampaignCall).toBeUndefined()
  })
})
```

**Step 2: Run the test to verify it fails**

```bash
yarn vitest app/api/campaign
```

Expected: FAIL — route calls `start-campaign`, not `generate-image`.

**Step 3: Update the route**

In `app/api/campaign/[id]/start/route.ts`, replace the start-campaign fire-and-forget block with:

```typescript
// Fire-and-forget: campaign cover image
const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-image`
const imageHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
if (process.env.GENERATE_IMAGE_WEBHOOK_SECRET) {
  imageHeaders.authorization = `Bearer ${process.env.GENERATE_IMAGE_WEBHOOK_SECRET}`
}
fetch(imageUrl, {
  method: 'POST',
  headers: imageHeaders,
  body: JSON.stringify({
    entity_type: 'campaign',
    entity_id: campaignId,
    image_type: 'cover',
  }),
}).catch((err) => console.error('[start] cover image trigger failed:', err))
```

Remove the `START_CAMPAIGN_WEBHOOK_SECRET` reference entirely.

**Step 4: Run tests to verify they pass**

```bash
yarn vitest app/api/campaign
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add app/api/campaign/[id]/start/route.ts app/api/campaign/[id]/start/__tests__/route.test.ts
git commit -m "feat: start route triggers campaign cover image directly, removes start-campaign call"
```

---

### Task 5: Drop opening_situation and starting_hooks DB columns

**Files:**
- Create: `supabase/migrations/YYYYMMDD_drop_opening_situation_starting_hooks.sql`
- Modify: `types/campaign.ts`

**Step 1: Create the migration**

```sql
ALTER TABLE campaigns
  DROP COLUMN opening_situation,
  DROP COLUMN starting_hooks;
```

Apply it via Supabase MCP:
```
mcp__supabase__apply_migration
  name: drop_opening_situation_starting_hooks
  query: (above SQL)
```

**Step 2: Update `types/campaign.ts`**

Remove `opening_situation` and `starting_hooks` from the `Campaign` type:

```typescript
export type Campaign = {
  id: string;
  slug: string;
  name: string;
  host_username: string;
  host_user_id: string;
  world_id: string;
  system_description: string | null;
  status: 'lobby' | 'active' | 'paused' | 'ended';
  turn_mode: 'free' | 'sequential';
  turn_timer_seconds: number;
  created_at: string;
  cover_url?: string | null;
};
```

**Step 3: Verify no remaining references**

```bash
yarn vitest
```

Also check for TypeScript errors:
```bash
yarn tsc --noEmit
```

Expected: no errors, no remaining references to `opening_situation` or `starting_hooks` in non-doc files.

**Step 4: Commit**

```bash
git add supabase/migrations/ types/campaign.ts
git commit -m "feat: drop opening_situation and starting_hooks columns — fields live in game-session chain"
```

---

### Task 6: Delete start-campaign edge function

**Files:**
- Delete: `supabase/functions/start-campaign/index.ts`

**Step 1: Delete the file**

```bash
rm supabase/functions/start-campaign/index.ts
```

**Step 2: Run full test suite and type check**

```bash
yarn vitest
yarn tsc --noEmit
```

Expected: all PASS, no errors.

**Step 3: Commit**

```bash
git add -A supabase/functions/start-campaign/
git commit -m "feat: delete start-campaign edge function — responsibilities moved to game-session and start route"
```

---

### Task 7: game-session — GM system prompt builder

This task creates the prompt builder module for game-session. The broader game-session WebSocket server is described in `docs/plans/2026-03-06-gameplay-design.md`; this task covers only the prompt and first-call schema.

**Files:**
- Create: `supabase/functions/game-session/prompt.ts`
- Create: `supabase/functions/game-session/__tests__/prompt.test.ts`

**Step 1: Write failing tests**

```typescript
// supabase/functions/game-session/__tests__/prompt.test.ts
import { describe, it, expect } from 'vitest'
import { buildGMSystemPrompt, buildFirstCallInput, isFirstCallResponse } from '../prompt.ts'

const world = {
  world_content: 'A dying empire of iron and ash. Geography: jagged mountains and fog-filled valleys.',
}

const players = [
  { character_name: 'Aria', character_class: 'Rogue', character_backstory: 'A former spy.' },
  { character_name: 'Brom', character_class: 'Fighter', character_backstory: null },
]

describe('buildGMSystemPrompt', () => {
  it('includes world content', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('A dying empire of iron and ash')
  })

  it('includes each player with class and backstory', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('Aria (Rogue): A former spy.')
    expect(prompt).toContain('Brom (Fighter)')
  })

  it('includes player placement rule', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('Player placement')
  })

  it('includes story hooks rule', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('Story hooks')
  })

  it('includes pacing rule', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('Pacing')
  })

  it('includes first response schema in output-format', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('world_context')
    expect(prompt).toContain('opening_situation')
    expect(prompt).toContain('starting_hooks')
  })
})

describe('buildFirstCallInput', () => {
  it('instructs the GM to generate world depth and opening scene', () => {
    const input = buildFirstCallInput()
    expect(input).toContain('History')
    expect(input).toContain('Factions')
    expect(input).toContain('Tone')
    expect(input).toContain('opening')
  })
})

describe('isFirstCallResponse', () => {
  it('returns true when world_context is present', () => {
    const response = {
      world_context: { history: '...', factions: '...', tone: '...' },
      opening_situation: '...',
      starting_hooks: ['hook 1'],
      actions: [],
      narration: ['The story begins.'],
    }
    expect(isFirstCallResponse(response)).toBe(true)
  })

  it('returns false when world_context is absent', () => {
    const response = {
      actions: [{ clientId: 'x', playerName: 'Aria', content: 'I look around.' }],
      narration: ['You see a room.'],
    }
    expect(isFirstCallResponse(response)).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn vitest supabase/functions/game-session/__tests__/prompt.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement `prompt.ts`**

```typescript
// supabase/functions/game-session/prompt.ts

export interface Player {
  character_name: string | null
  character_class: string | null
  character_backstory: string | null
  username?: string | null
}

export interface FirstCallResponse {
  world_context: { history: string; factions: string; tone: string }
  opening_situation: string
  starting_hooks: string[]
  actions: []
  narration: string[]
}

export interface RoundResponse {
  actions: Array<{ clientId: string; playerName: string; content: string }>
  narration: string[]
}

export type GMResponse = FirstCallResponse | RoundResponse

export function buildGMSystemPrompt(worldContent: string, players: Player[]): string {
  const playerList = players
    .map((p) => {
      const name = p.character_name ?? p.username ?? 'Unknown'
      const cls = p.character_class ?? 'unknown class'
      const backstory = p.character_backstory ? `: ${p.character_backstory}` : ''
      return `- ${name} (${cls})${backstory}`
    })
    .join('\n')

  return `<role>
You are the Game Master for a tabletop RPG campaign. Narrate the story in second person,
immersive prose. React to all player actions collectively. Detect the language used in
the world description and write all narration entirely in that language.
</role>

<world>
${worldContent}
</world>

<player-characters>
${playerList}
</player-characters>

<narration-rules>
- Address all player actions in each narration. No player is ignored.
- Keep narrations between 3-6 paragraphs. Vivid but not exhausting.
- End each narration with a clear situation: what the players see, hear, or face next.
- If a player's action is impossible or fails, narrate the failure dramatically.
- Never break character. Never acknowledge you are an AI.

Player placement: Players may begin together, in small groups, or alone — honor the
opening situation exactly. When players are split, narrate each group's location and
immediate reality. Bring them together only when the story earns it.

Opening narration: The first narration must establish the world vividly — atmosphere,
place, what is at stake — and make each player's position and situation immediately clear.
Do not waste the opening on generic scene-setting.

Story hooks: The starting hooks are the spine of this campaign. Reference them, develop
them, escalate them. Every 2-3 narrations, at least one hook should be visibly in motion —
named, felt, or pressing closer.

World texture: Weave world-specific details (locations, factions, creatures, history) into
every narration. The world should feel alive and specific, not generic.

Pacing: This campaign is meant to be short and intense. Drive toward meaningful moments —
confrontations, revelations, decisions. Avoid filler. If the players stall, a hook tightens.
</narration-rules>

<mechanics-rules>
- HP is tracked on a 0-20 scale.
- D20 rolls determine success on contested or risky actions.
- Describe dice outcomes narratively — never expose raw numbers.
</mechanics-rules>

<output-format>
Every response must be a JSON object. No markdown fences, no text outside the JSON.

First response schema:
{
  "world_context": { "history": "string", "factions": "string", "tone": "string" },
  "opening_situation": "string",
  "starting_hooks": ["string", "string", "string"],
  "actions": [],
  "narration": ["string"]
}

All subsequent responses:
{
  "actions": [{ "clientId": "string", "playerName": "string", "content": "string" }],
  "narration": ["string"]
}
</output-format>`
}

export function buildFirstCallInput(): string {
  return `Generate this world's History, Factions, and Tone. Then establish the opening situation and starting hooks for this campaign. Then narrate the opening scene. Respond using the first response schema.`
}

export function isFirstCallResponse(response: unknown): response is FirstCallResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'world_context' in response
  )
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn vitest supabase/functions/game-session/__tests__/prompt.test.ts
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add supabase/functions/game-session/prompt.ts supabase/functions/game-session/__tests__/prompt.test.ts
git commit -m "feat: game-session GM prompt builder with engagement rules and first-call schema"
```

---

### Task 8: game-session — first call response handling

This task ensures the game-session server reads `world_context`/`opening_situation`/`starting_hooks` from the first call response without broadcasting them to clients. This integrates with the broader `openai.ts` module described in the gameplay design plan.

**Files:**
- Create or modify: `supabase/functions/game-session/openai.ts`
- Create: `supabase/functions/game-session/__tests__/openai.test.ts`

**Step 1: Write failing tests**

```typescript
// supabase/functions/game-session/__tests__/openai.test.ts
import { describe, it, expect } from 'vitest'
import { extractNarration } from '../openai.ts'

describe('extractNarration', () => {
  it('returns narration from a first-call response', () => {
    const response = {
      world_context: { history: 'Long history', factions: 'Many factions', tone: 'Dark' },
      opening_situation: 'You find yourselves at the gate.',
      starting_hooks: ['The gate is sealed.', 'A figure watches.', 'Smoke rises.'],
      actions: [],
      narration: ['The iron gate looms.', 'Rain begins to fall.'],
    }
    expect(extractNarration(response)).toEqual(['The iron gate looms.', 'Rain begins to fall.'])
  })

  it('returns narration from a round response', () => {
    const response = {
      actions: [{ clientId: 'x', playerName: 'Aria', content: 'I draw my sword.' }],
      narration: ['Aria draws her blade with a sharp ring.'],
    }
    expect(extractNarration(response)).toEqual(['Aria draws her blade with a sharp ring.'])
  })

  it('returns empty array when narration is missing', () => {
    expect(extractNarration({})).toEqual([])
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn vitest supabase/functions/game-session/__tests__/openai.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement `extractNarration` in `openai.ts`**

Create `supabase/functions/game-session/openai.ts` with at minimum:

```typescript
import { isFirstCallResponse, GMResponse } from './prompt.ts'

export function extractNarration(response: unknown): string[] {
  if (typeof response !== 'object' || response === null) return []
  const r = response as Record<string, unknown>
  if (!Array.isArray(r.narration)) return []
  return r.narration as string[]
}
```

The `openai.ts` module will grow as the broader game-session is built (streaming, previous_response_id, etc.) per the gameplay design plan. This task only adds the narration extraction and establishes the file.

**Step 4: Run tests to verify they pass**

```bash
yarn vitest supabase/functions/game-session/__tests__/openai.test.ts
```

Expected: all PASS.

**Step 5: Run full test suite**

```bash
yarn vitest
```

Expected: all PASS.

**Step 6: Commit**

```bash
git add supabase/functions/game-session/openai.ts supabase/functions/game-session/__tests__/openai.test.ts
git commit -m "feat: game-session openai module — narration extraction from first and round responses"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `yarn vitest` — all tests pass
- [ ] `yarn tsc --noEmit` — no TypeScript errors
- [ ] No references to `opening_situation` or `starting_hooks` outside docs and migrations
- [ ] No references to `start-campaign` edge function in app code
- [ ] `generate-world` system prompt contains no History/Factions/Tone sections
- [ ] DB columns dropped (verify via Supabase dashboard or `SELECT column_name FROM information_schema.columns WHERE table_name = 'campaigns'`)
