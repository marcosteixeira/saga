# World Gen Refactor Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove "Current Situation" and "Starting Hooks" from world creation — these sections depend on the players who joined and will be generated later when the session starts.

**Architecture:** Strip those two sections from the world gen prompt and required sections validation. No other changes.

**Tech Stack:** TypeScript, vitest

---

## Part 1 — Create Branch + Strip Sections from World Gen

### Task 1: Create feature branch

**Step 1: Create and checkout branch**

```bash
git checkout -b feat/world-gen-session-start-refactor
```

**Step 2: Confirm**

```bash
git branch
```

Expected: `* feat/world-gen-session-start-refactor`

---

### Task 2: Remove sections from world gen prompt

**Files:**
- Modify: `lib/prompts/world-gen.ts`
- Create: `lib/prompts/__tests__/world-gen.test.ts`

**Step 1: Write failing tests**

Create `lib/prompts/__tests__/world-gen.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildWorldGenPrompt } from '../world-gen'

describe('buildWorldGenPrompt', () => {
  it('does not include Current Situation section', () => {
    const prompt = buildWorldGenPrompt('A dark steampunk world')
    expect(prompt.system).not.toContain('Current Situation')
  })

  it('does not include Starting Hooks section', () => {
    const prompt = buildWorldGenPrompt('A dark steampunk world')
    expect(prompt.system).not.toContain('Starting Hooks')
  })

  it('still includes the 6 core world sections', () => {
    const prompt = buildWorldGenPrompt('A dark steampunk world')
    expect(prompt.system).toContain('## World Name')
    expect(prompt.system).toContain('## Overview')
    expect(prompt.system).toContain('## History')
    expect(prompt.system).toContain('## Geography')
    expect(prompt.system).toContain('## Factions')
    expect(prompt.system).toContain('## Tone')
  })

  it('passes the world description as the user message', () => {
    const desc = 'A sunken city ruled by merfolk'
    const prompt = buildWorldGenPrompt(desc)
    expect(prompt.user).toBe(desc)
  })
})
```

**Step 2: Run tests — verify they fail**

```bash
yarn test lib/prompts/__tests__/world-gen
```

Expected: FAIL — "Current Situation" and "Starting Hooks" are still in the prompt.

**Step 3: Update `lib/prompts/world-gen.ts`**

```typescript
export interface WorldGenPrompt {
  system: string
  user: string
}

export function buildWorldGenPrompt(worldDescription: string): WorldGenPrompt {
  return {
    system: `You are a fantasy world-builder. Generate a rich WORLD.md document for a tabletop RPG campaign based on the player's description.

Output a Markdown document with exactly these sections (use ## headings):
## World Name
## Overview
## History
## Geography
## Factions
## Tone

Be evocative and specific. Output ONLY the Markdown document, no preamble.`,
    user: worldDescription,
  }
}
```

**Step 4: Run tests — verify they pass**

```bash
yarn test lib/prompts/__tests__/world-gen
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add lib/prompts/world-gen.ts lib/prompts/__tests__/world-gen.test.ts
git commit -m "feat: remove Current Situation and Starting Hooks from world gen prompt"
```

---

### Task 3: Update world content validation

**Files:**
- Modify: `supabase/functions/generate-world/world-content.ts`
- Create: `supabase/functions/generate-world/__tests__/world-content.test.ts`

**Step 1: Write failing tests**

Create `supabase/functions/generate-world/__tests__/world-content.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { REQUIRED_WORLD_SECTIONS, getMissingRequiredSections, hasAllRequiredSections } from '../world-content'

const VALID_WORLD_MD = `
## World Name
Ironhold

## Overview
A dying empire...

## History
Once great...

## Geography
Mountains and fog...

## Factions
The Guild controls...

## Tone
Dark, industrial, hopeless.
`

describe('REQUIRED_WORLD_SECTIONS', () => {
  it('contains exactly 6 sections', () => {
    expect(REQUIRED_WORLD_SECTIONS).toHaveLength(6)
  })

  it('does not include Current Situation', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## Current Situation')
  })

  it('does not include Starting Hooks', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## Starting Hooks')
  })
})

describe('hasAllRequiredSections', () => {
  it('returns true when all 6 sections are present', () => {
    expect(hasAllRequiredSections(VALID_WORLD_MD)).toBe(true)
  })

  it('returns false when a required section is missing', () => {
    const incomplete = VALID_WORLD_MD.replace('## Factions', '')
    expect(hasAllRequiredSections(incomplete)).toBe(false)
  })
})

describe('getMissingRequiredSections', () => {
  it('returns empty array when all sections present', () => {
    expect(getMissingRequiredSections(VALID_WORLD_MD)).toEqual([])
  })

  it('returns missing section names', () => {
    const incomplete = VALID_WORLD_MD.replace('## Tone', '')
    expect(getMissingRequiredSections(incomplete)).toEqual(['## Tone'])
  })
})
```

**Step 2: Run tests — verify they fail**

```bash
yarn test supabase/functions/generate-world/__tests__/world-content
```

Expected: FAIL — REQUIRED_WORLD_SECTIONS still has 8 items.

**Step 3: Update `supabase/functions/generate-world/world-content.ts`**

```typescript
export const REQUIRED_WORLD_SECTIONS = [
  '## World Name',
  '## Overview',
  '## History',
  '## Geography',
  '## Factions',
  '## Tone',
] as const

export function getMissingRequiredSections(content: string): string[] {
  return REQUIRED_WORLD_SECTIONS.filter((section) => !content.includes(section))
}

export function hasAllRequiredSections(content: string): boolean {
  return getMissingRequiredSections(content).length === 0
}
```

**Step 4: Run tests — verify they pass**

```bash
yarn test supabase/functions/generate-world/__tests__/world-content
```

Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add supabase/functions/generate-world/world-content.ts supabase/functions/generate-world/__tests__/world-content.test.ts
git commit -m "feat: remove Current Situation and Starting Hooks from required world sections"
```

---

## Part 2 — Update Future Plans

### Task 4: Update PR 08 plan with session-start generation note

**Files:**
- Modify: `docs/plans/08-lobby-realtime-portraits.md`

**Step 1: Find Task 4 ("Session Start API Route") in the file and add a note after the final commit step**

After the `git commit -m "feat: POST /api/campaign/[id]/session/start with auth"` step, insert:

```markdown
**Note on future work:** When the session starts, the game needs to generate "Current Situation", "Starting Hooks", and initial "Areas" tailored to the players who joined. This generation should be triggered from this API route (or a webhook) in a future PR. It reads WORLD.md + joined player characters → appends Current Situation and Starting Hooks to WORLD.md → writes initial Areas to LOCATIONS.md.
```

**Step 2: Commit**

```bash
git add docs/plans/08-lobby-realtime-portraits.md
git commit -m "docs: note future session-start generation work in PR 08 plan"
```

---

## Testing Summary

| What | How | Tests |
|------|-----|-------|
| `buildWorldGenPrompt` no longer has removed sections | Unit (vitest) | 4 tests |
| `REQUIRED_WORLD_SECTIONS` has 6 items | Unit (vitest) | 7 tests |

## Acceptance Criteria

- [ ] World gen prompt no longer contains `## Current Situation` or `## Starting Hooks`
- [ ] `REQUIRED_WORLD_SECTIONS` has 6 items — all tests pass
- [ ] PR 08 plan has a note about future session-start generation
- [ ] `yarn build` succeeds
- [ ] All unit tests pass: `yarn test`
