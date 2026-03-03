# PR 11: Memory System (MEMORY_UPDATE Parsing)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parse the MEMORY_UPDATE JSON block from Claude's narration output and update the campaign memory files (WORLD.md, CHARACTERS.md, NPCS.md, LOCATIONS.md, MEMORY.md) and player stats. Also detect GENERATE_IMAGE tags and trigger scene image generation.

**Architecture:** After each narration completes, the server-side code extracts the MEMORY_UPDATE JSON and GENERATE_IMAGE directive from the narration text. The visible narration (before these blocks) is what gets saved to messages. The MEMORY_UPDATE data is parsed and applied to campaign_files and player rows. GENERATE_IMAGE triggers a background image generation call.

**Tech Stack:** JSON parsing, Supabase, Gemini (for scene images)

**Depends on:** PR 10, PR 06

---

### Task 1: Build MEMORY_UPDATE Extractor

**Files:**
- Create: `lib/prompts/memory-update.ts`
- Create: `lib/prompts/__tests__/memory-update.test.ts`

**Spec:**

```typescript
extractMemoryUpdate(narrationText: string): {
  narration: string                    // Clean narration text (for display)
  memoryUpdate: MemoryUpdate | null    // Parsed JSON or null if not found
  generateImage: string | null         // Image description or null
}
```

The function:
1. Finds the `MEMORY_UPDATE` JSON block in the narration (may be wrapped in ```json code fences or raw JSON)
2. Extracts and parses it
3. Finds `GENERATE_IMAGE: <description>` if present
4. Returns the clean narration (with MEMORY_UPDATE and GENERATE_IMAGE removed), the parsed update, and the image prompt

```typescript
type MemoryUpdate = {
  npcs?: Array<{ name: string; status?: string; disposition?: string; note?: string }>
  locations?: Array<{ name: string; status?: string; note?: string }>
  character_updates?: Array<{ name: string; hp?: number; note?: string }>
  events?: string[]
  memory_md?: string
}
```

**Step 1: Write tests**

```typescript
describe('extractMemoryUpdate', () => {
  it('extracts JSON MEMORY_UPDATE block from narration', () => {
    const text = `The party enters the tavern.\n\nMEMORY_UPDATE\n\`\`\`json\n{"events":["Entered tavern"],"memory_md":"Party is in the tavern."}\n\`\`\``
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('The party enters the tavern.')
    expect(result.memoryUpdate?.events).toEqual(['Entered tavern'])
    expect(result.memoryUpdate?.memory_md).toBe('Party is in the tavern.')
  })

  it('extracts raw JSON block without code fences', () => {
    const text = `Narration text.\n\nMEMORY_UPDATE\n{"events":["Something happened"]}`
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('Narration text.')
    expect(result.memoryUpdate?.events).toEqual(['Something happened'])
  })

  it('extracts GENERATE_IMAGE directive', () => {
    const text = `The dragon appears!\n\nGENERATE_IMAGE: A massive red dragon breathing fire in a dark cavern`
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('The dragon appears!')
    expect(result.generateImage).toBe('A massive red dragon breathing fire in a dark cavern')
  })

  it('handles narration with both MEMORY_UPDATE and GENERATE_IMAGE', () => {
    const text = `Battle begins!\n\nMEMORY_UPDATE\n{"events":["Combat started"]}\n\nGENERATE_IMAGE: Warriors facing a horde of goblins`
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('Battle begins!')
    expect(result.memoryUpdate?.events).toEqual(['Combat started'])
    expect(result.generateImage).toBe('Warriors facing a horde of goblins')
  })

  it('returns null memoryUpdate when no block found', () => {
    const text = 'Just plain narration with no special blocks.'
    const result = extractMemoryUpdate(text)
    expect(result.narration).toBe(text)
    expect(result.memoryUpdate).toBeNull()
    expect(result.generateImage).toBeNull()
  })

  it('handles malformed JSON gracefully', () => {
    const text = `Narration.\n\nMEMORY_UPDATE\n{invalid json here}`
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('Narration.')
    expect(result.memoryUpdate).toBeNull()
  })

  it('extracts character_updates with HP changes', () => {
    const text = `The goblin strikes Gandalf!\n\nMEMORY_UPDATE\n{"character_updates":[{"name":"Gandalf","hp":15,"note":"Took 5 damage from goblin"}]}`
    const result = extractMemoryUpdate(text)
    expect(result.memoryUpdate?.character_updates?.[0]).toEqual({
      name: 'Gandalf', hp: 15, note: 'Took 5 damage from goblin'
    })
  })
})
```

7 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

Use regex to find the MEMORY_UPDATE block. Try to parse JSON. Use regex for GENERATE_IMAGE. Strip all extracted blocks from the narration.

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: MEMORY_UPDATE and GENERATE_IMAGE extraction"
```

---

### Task 2: Build Memory File Updater

**Files:**
- Create: `lib/memory-updater.ts`
- Create: `lib/__tests__/memory-updater.test.ts`

**Spec:**

```typescript
applyMemoryUpdate(campaignId: string, update: MemoryUpdate): Promise<void>
```

Applies the parsed MEMORY_UPDATE to the campaign's memory files:

1. **MEMORY.md**: If `memory_md` is present, replace the entire content with the new value
2. **NPCS.md**: For each NPC in `npcs`, append or update the NPC entry in the file
3. **LOCATIONS.md**: For each location in `locations`, append or update the location entry
4. **CHARACTERS.md**: For each character_update, update the character's HP and add notes
5. **Player stats**: For each `character_update` with an `hp` value, update the player row's `stats.hp`

File update strategy for NPCS.md and LOCATIONS.md:
- Simple append: each new NPC/location gets added as a markdown section
- If an NPC/location with the same name exists (line starts with `## Name`), replace that section
- Keep it simple — regex-based section replacement

**Step 1: Write tests**

```typescript
describe('applyMemoryUpdate', () => {
  it('updates MEMORY.md with new content', async () => {
    // Mock upsertCampaignFile
    // Verify it's called with new memory_md content
  })

  it('appends new NPC to NPCS.md', async () => {
    // Mock getCampaignFile returning existing content
    // Mock upsertCampaignFile
    // Verify new NPC section appended
  })

  it('updates existing NPC in NPCS.md', async () => {
    // Mock getCampaignFile returning content with existing NPC
    // Verify section replaced, not duplicated
  })

  it('appends new location to LOCATIONS.md', async () => {
    // Similar to NPC test
  })

  it('updates player stats in database', async () => {
    // Mock player query and update
    // Verify stats.hp updated for the correct player
  })

  it('handles update with no fields gracefully', async () => {
    // Pass empty MemoryUpdate
    // Verify no errors thrown
  })
})
```

6 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: apply MEMORY_UPDATE to campaign files and player stats"
```

---

### Task 3: Integrate Memory Updates into Narration Flow

**Files:**
- Modify: `app/api/campaign/[id]/narrate/route.ts`

**Spec:**

After the Claude stream completes:

1. Extract MEMORY_UPDATE and GENERATE_IMAGE from the full narration text
2. Save the **clean narration** (without the JSON blocks) to the messages table
3. If `memoryUpdate` is present: call `applyMemoryUpdate()` (fire-and-forget, don't block response)
4. If `generateImage` is present: call image generation API (fire-and-forget)
5. Broadcast the clean narration in the `done` event (not the raw text with JSON blocks)

**Step 1: Update narration route tests**

```typescript
it('extracts and applies MEMORY_UPDATE after stream completes', async () => {
  // Mock Claude stream returning narration with MEMORY_UPDATE block
  // Verify applyMemoryUpdate called with parsed data
  // Verify saved message has clean narration (no JSON block)
})

it('triggers image generation when GENERATE_IMAGE found', async () => {
  // Mock Claude stream returning narration with GENERATE_IMAGE
  // Verify generateAndStoreImage called
})

it('saves clean narration without MEMORY_UPDATE or GENERATE_IMAGE blocks', async () => {
  // Verify the message saved to DB doesn't contain the raw blocks
})
```

3 new test cases.

**Step 2: Run tests — fail**

**Step 3: Update implementation**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: integrate memory updates and image triggers into narration"
```

---

### Task 4: Update CHARACTERS.md on Player Join

**Files:**
- Modify: `app/api/campaign/[id]/join/route.ts`
- Modify: `lib/memory.ts` (add helper)

**Spec:**

When a player joins (PR 06's join route), also update CHARACTERS.md:

Append a section for the new character:
```markdown
## Character Name
- **Player:** Username
- **Class:** Character Class
- **HP:** 20/20
- **Status:** Active
- **Backstory:** Character backstory text...
```

**Step 1: Add helper to lib/memory.ts**

```typescript
appendCharacterToFile(campaignId: string, player: Player): Promise<void>
```

**Step 2: Write test**

```typescript
it('appends character section to CHARACTERS.md', async () => {
  // Mock existing CHARACTERS.md content
  // Verify new section appended with correct format
})
```

**Step 3: Run test — fail**

**Step 4: Implement**

**Step 5: Update join route to call appendCharacterToFile**

**Step 6: Run tests — pass**

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: update CHARACTERS.md when player joins"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| extractMemoryUpdate | Unit test (vitest) | 7 tests: JSON extraction, GENERATE_IMAGE, malformed JSON, combined |
| applyMemoryUpdate | Unit test (vitest) | 6 tests: each file type, player stats, empty update |
| Narration integration | Unit test (vitest) | 3 tests: extract + apply + clean save |
| appendCharacterToFile | Unit test (vitest) | 1 test |
| End-to-end memory flow | Manual | Trigger narration, check campaign_files updated in DB |

---

## Acceptance Criteria

- [ ] MEMORY_UPDATE JSON extracted and parsed from narration text (7 tests passing)
- [ ] Memory update applied to NPCS.md, LOCATIONS.md, MEMORY.md, CHARACTERS.md, player stats (6 tests passing)
- [ ] Narration route saves clean text, applies memory update, triggers image gen (3 tests passing)
- [ ] CHARACTERS.md updated when player joins (1 test passing)
- [ ] Malformed JSON doesn't crash the system
- [ ] Scene images generated when GENERATE_IMAGE detected
- [ ] `yarn build` succeeds
