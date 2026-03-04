# World Classes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate 6 world-specific character classes during world creation and display them as the only selectable options during character creation in the lobby.

**Architecture:** The `generate-world` Edge Function already generates Markdown world content via Claude. We extend the same AI call to also return a `## Classes` JSON block at the end; the Edge Function parses it out, saves it to a new `classes JSONB` column on `worlds`, and strips it from the Markdown. The existing `GET /api/campaign/[id]` already returns `world` so the lobby character creation form gets classes for free.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + Edge Functions), Deno, Vitest, Tailwind + shadcn/ui, Claude Haiku 4.5

---

### Task 1: DB Migration — add `classes` column to `worlds`

**Files:**
- Create: `supabase/migrations/006_world_classes.sql`

**Step 1: Write the migration file**

```sql
-- supabase/migrations/006_world_classes.sql
ALTER TABLE worlds ADD COLUMN classes JSONB NOT NULL DEFAULT '[]';
```

**Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: migration applied with no errors, `worlds` table now has a `classes` column.

**Step 3: Verify in Supabase Studio or psql**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'worlds' AND column_name = 'classes';
```

Expected: one row — `classes | jsonb`

**Step 4: Commit**

```bash
git add supabase/migrations/006_world_classes.sql
git commit -m "feat: add classes jsonb column to worlds table"
```

---

### Task 2: Update `WorldClass` type + `World` type

**Files:**
- Modify: `types/world.ts`

**Step 1: Add `WorldClass` type and update `World`**

Open `types/world.ts`. The current file is:

```typescript
export type WorldStatus = 'generating' | 'ready' | 'error';

export type World = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  world_content: string | null;
  cover_image_url: string | null;
  map_image_url: string | null;
  status: WorldStatus;
  created_at: string;
};

export type WorldInsert = Pick<World, 'user_id' | 'name' | 'description'>;
```

Replace with:

```typescript
export type WorldStatus = 'generating' | 'ready' | 'error';

export type WorldClass = {
  name: string;
  description: string;
};

export type World = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  world_content: string | null;
  cover_image_url: string | null;
  map_image_url: string | null;
  status: WorldStatus;
  classes: WorldClass[];
  created_at: string;
};

export type WorldInsert = Pick<World, 'user_id' | 'name' | 'description'>;
```

**Step 2: Check for TypeScript errors**

```bash
yarn tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add types/world.ts
git commit -m "feat: add WorldClass type and classes field to World"
```

---

### Task 3: Add class parsing helpers to `world-content.ts`

This file already handles section validation. We'll add two new exports: one to parse the classes JSON block out of the raw AI output, one to validate the parsed classes.

**Files:**
- Modify: `supabase/functions/generate-world/world-content.ts`
- Test: `supabase/functions/generate-world/__tests__/world-content.test.ts`

**Step 1: Write the failing tests**

Open `supabase/functions/generate-world/__tests__/world-content.test.ts` and add at the bottom:

```typescript
// --- parseClassesFromContent ---

const VALID_CLASSES_JSON = JSON.stringify([
  { name: "Shadow Warden", description: "Protectors of the veil." },
  { name: "Ashen Knight", description: "Warriors of cursed flame." },
  { name: "Veil Dancer", description: "Illusionists of the mist." },
  { name: "Iron Cleric", description: "Faith hammered into steel." },
  { name: "Hollow Scout", description: "Rangers who feel no fear." },
  { name: "Dusk Mage", description: "Scholars of dying light." },
])

const VALID_CONTENT_WITH_CLASSES = `
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

## Classes
\`\`\`json
${VALID_CLASSES_JSON}
\`\`\`
`

describe('parseClassesFromContent', () => {
  it('extracts the classes array from valid content', () => {
    const result = parseClassesFromContent(VALID_CONTENT_WITH_CLASSES)
    expect(result).toHaveLength(6)
    expect(result[0]).toEqual({ name: "Shadow Warden", description: "Protectors of the veil." })
  })

  it('returns empty array when ## Classes section is missing', () => {
    expect(parseClassesFromContent(VALID_WORLD_MD)).toEqual([])
  })

  it('returns empty array when JSON block is malformed', () => {
    const bad = VALID_CONTENT_WITH_CLASSES.replace(VALID_CLASSES_JSON, 'not-json')
    expect(parseClassesFromContent(bad)).toEqual([])
  })
})

describe('stripClassesFromContent', () => {
  it('removes the ## Classes section and returns clean markdown', () => {
    const stripped = stripClassesFromContent(VALID_CONTENT_WITH_CLASSES)
    expect(stripped).not.toContain('## Classes')
    expect(stripped).not.toContain('```json')
    expect(stripped).toContain('## Tone')
  })

  it('returns original content unchanged when no ## Classes section exists', () => {
    const result = stripClassesFromContent(VALID_WORLD_MD)
    expect(result).toBe(VALID_WORLD_MD)
  })
})

describe('validateClasses', () => {
  it('returns true for exactly 6 valid class objects', () => {
    const classes = JSON.parse(VALID_CLASSES_JSON)
    expect(validateClasses(classes)).toBe(true)
  })

  it('returns false when fewer than 6 classes', () => {
    expect(validateClasses([{ name: "A", description: "B" }])).toBe(false)
  })

  it('returns false when a class is missing name', () => {
    const bad = [
      { description: "No name" },
      ...JSON.parse(VALID_CLASSES_JSON).slice(1),
    ]
    expect(validateClasses(bad)).toBe(false)
  })

  it('returns false when a class is missing description', () => {
    const bad = [
      { name: "No desc" },
      ...JSON.parse(VALID_CLASSES_JSON).slice(1),
    ]
    expect(validateClasses(bad)).toBe(false)
  })
})
```

Also update the import at the top of the test file:

```typescript
import { REQUIRED_WORLD_SECTIONS, getMissingRequiredSections, hasAllRequiredSections, parseClassesFromContent, stripClassesFromContent, validateClasses } from '../world-content'
```

**Step 2: Run tests to verify they fail**

```bash
yarn test supabase/functions/generate-world/__tests__/world-content.test.ts
```

Expected: FAIL — `parseClassesFromContent`, `stripClassesFromContent`, `validateClasses` are not exported.

**Step 3: Implement the three helpers in `world-content.ts`**

Open `supabase/functions/generate-world/world-content.ts`. Append these exports:

```typescript
export type WorldClass = {
  name: string;
  description: string;
};

/**
 * Extracts the JSON classes array from the ## Classes code block.
 * Returns [] if the section is missing or the JSON is invalid.
 */
export function parseClassesFromContent(content: string): WorldClass[] {
  const match = content.match(/## Classes\s*```json\s*([\s\S]*?)```/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

/**
 * Removes the ## Classes section (heading + code block) from the content.
 * Returns original content if no Classes section found.
 */
export function stripClassesFromContent(content: string): string {
  return content.replace(/\n?## Classes\s*```json\s*[\s\S]*?```\s*/g, '')
}

/**
 * Returns true if classes is an array of exactly 6 objects with name + description strings.
 */
export function validateClasses(classes: unknown[]): boolean {
  if (!Array.isArray(classes) || classes.length !== 6) return false
  return classes.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as Record<string, unknown>).name === 'string' &&
      typeof (c as Record<string, unknown>).description === 'string'
  )
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test supabase/functions/generate-world/__tests__/world-content.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add supabase/functions/generate-world/world-content.ts \
        supabase/functions/generate-world/__tests__/world-content.test.ts
git commit -m "feat: add parseClassesFromContent, stripClassesFromContent, validateClasses helpers"
```

---

### Task 4: Update the Edge Function — prompt + parse + save classes

**Files:**
- Modify: `supabase/functions/generate-world/index.ts`

**Step 1: Update the system prompt**

In `index.ts`, find the `systemPrompt` const (line 69). Replace it with:

```typescript
const systemPrompt = `You are a world-builder for tabletop RPG campaigns. Generate a rich WORLD.md document faithful to the genre, tone, and setting described by the player. Do NOT impose a fantasy genre — if the player describes a sci-fi, horror, Western, crime, or any other setting, match it exactly.

Output a Markdown document with exactly these sections (use ## headings):
## World Name
## Overview
## History
## Geography
## Factions
## Tone
## Classes

The ## Classes section must contain a JSON code block with exactly 6 character classes specific to this world's lore, tone, and setting. Format:
\`\`\`json
[
  { "name": "Class Name", "description": "One sentence flavor description." },
  ...
]
\`\`\`

Be evocative and specific. Class names should feel native to this world — avoid generic names like "Warrior" or "Mage". Output ONLY the Markdown document, no preamble.`
```

**Step 2: Add `## Classes` to required sections validation**

Open `supabase/functions/generate-world/world-content.ts`. Update `REQUIRED_WORLD_SECTIONS`:

```typescript
export const REQUIRED_WORLD_SECTIONS = [
  '## World Name',
  '## Overview',
  '## History',
  '## Geography',
  '## Factions',
  '## Tone',
  '## Classes',
] as const
```

**Step 3: Update the test for `REQUIRED_WORLD_SECTIONS` count**

In `__tests__/world-content.test.ts`, find:

```typescript
it('contains exactly 6 sections', () => {
  expect(REQUIRED_WORLD_SECTIONS).toHaveLength(6)
})
```

Update to:

```typescript
it('contains exactly 7 sections', () => {
  expect(REQUIRED_WORLD_SECTIONS).toHaveLength(7)
})
```

Also update `VALID_WORLD_MD` to include the `## Classes` section so existing tests don't break:

```typescript
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

## Classes
\`\`\`json
${VALID_CLASSES_JSON}
\`\`\`
`
```

Wait — `VALID_CLASSES_JSON` is defined after `VALID_WORLD_MD` in the test file. Reorder: define `VALID_CLASSES_JSON` **before** `VALID_WORLD_MD`.

**Step 4: Parse classes after AI generation, validate, save to DB**

In `index.ts`, find the block that calls `getMissingRequiredSections` (around line 111). The retry loop currently only checks for missing sections. We need to also validate classes. Update the loop body:

After the line:
```typescript
missingSections = getMissingRequiredSections(worldContent)
```

Add:
```typescript
const parsedClasses = parseClassesFromContent(worldContent)
const classesValid = validateClasses(parsedClasses)
if (!classesValid && attempt < WORLD_GEN_MAX_ATTEMPTS) {
  missingSections = [...missingSections, '## Classes (invalid JSON or wrong count)']
}
```

Add the import at the top of `index.ts`:
```typescript
import { getMissingRequiredSections, parseClassesFromContent, stripClassesFromContent, validateClasses } from "./world-content.ts"
```

Replace the existing import:
```typescript
import { getMissingRequiredSections } from "./world-content.ts"
```

**Step 5: Strip classes from world_content before saving, save classes separately**

Find the Supabase update block (around line 137):

```typescript
await supabase
  .from("worlds")
  .update({ world_content: worldContent, status: "ready" })
  .eq("id", world.id)
```

Replace with:

```typescript
const parsedClasses = parseClassesFromContent(worldContent)
const cleanWorldContent = stripClassesFromContent(worldContent)

await supabase
  .from("worlds")
  .update({ world_content: cleanWorldContent, classes: parsedClasses, status: "ready" })
  .eq("id", world.id)
```

Note: `parsedClasses` was already computed in the retry loop. Move the declaration outside the loop so it's in scope here. Declare `let parsedClasses: WorldClass[] = []` before the loop, and update inside the loop.

**Step 6: Import `WorldClass` type in the Edge Function**

Since `WorldClass` is defined in `world-content.ts`, add it to the import:

```typescript
import { getMissingRequiredSections, parseClassesFromContent, stripClassesFromContent, validateClasses, WorldClass } from "./world-content.ts"
```

And declare before the loop:
```typescript
let parsedClasses: WorldClass[] = []
```

Update inside the loop (after existing `missingSections` assignment):
```typescript
parsedClasses = parseClassesFromContent(worldContent)
const classesValid = validateClasses(parsedClasses)
if (!classesValid) {
  missingSections = [...missingSections, '## Classes (invalid or missing)']
}
```

**Step 7: Run all Edge Function tests**

```bash
yarn test supabase/functions/generate-world/__tests__/
```

Expected: all tests PASS.

**Step 8: Commit**

```bash
git add supabase/functions/generate-world/index.ts \
        supabase/functions/generate-world/world-content.ts \
        supabase/functions/generate-world/__tests__/world-content.test.ts
git commit -m "feat: generate and save world classes in generate-world edge function"
```

---

### Task 5: Deploy the updated Edge Function

**Step 1: Deploy**

```bash
npx supabase functions deploy generate-world
```

Expected: deployment successful, no errors.

**Step 2: Commit**

No additional files to commit — deployment is live.

---

### Task 6: Run all tests and verify

**Step 1: Run full test suite**

```bash
yarn test
```

Expected: all tests pass.

**Step 2: Manual smoke test**

1. Create a new world via the UI
2. Wait for generation to complete
3. In Supabase Studio, open the `worlds` table
4. Verify the new world has `classes` populated with 6 entries and `world_content` does NOT contain `## Classes`

**Step 3: Final commit if anything was missed**

```bash
git status
# commit any remaining changes
```
