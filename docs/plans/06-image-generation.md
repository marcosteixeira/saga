# PR 06: Image Generation (Gemini — Cover Art + World Map)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Gemini image generation to produce cover art and world maps during campaign creation. Establish the image generation API route that will also be used later for scene images and character portraits.

**Architecture:** Gemini Nano Banana Pro generates images from text prompts. Images are stored in Supabase Storage and their URLs saved to the campaign row. The generation happens in the background after the campaign is created — the world preview shows a loading placeholder until images are ready, then displays them.

**Tech Stack:** `@google/genai`, Gemini Nano Banana Pro (`gemini-3-pro-image-preview`), Supabase Storage

**Depends on:** PR 05

---

### Task 1: Install Google AI SDK and Create Client

**Step 1: Install**

Run: `yarn add @google/genai`

**Step 2: Create Gemini client**

Create: `lib/gemini.ts`

```typescript
import { GoogleGenAI } from '@google/genai'

export const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
})
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: install Google GenAI SDK and create client"
```

---

### Task 2: Build Image Generation Service

**Files:**
- Create: `lib/image-gen.ts`
- Create: `lib/__tests__/image-gen.test.ts`

**Spec:**

```typescript
// Generate an image from a text prompt, upload to Supabase Storage, return URL
generateAndStoreImage(options: {
  prompt: string
  bucket: string       // e.g., 'campaign-images'
  path: string         // e.g., 'campaign-123/cover.png'
}): Promise<string>    // Returns public URL
```

Flow:
1. Call Gemini with the prompt, requesting image output
2. Receive base64 image data from the response
3. Convert to buffer, upload to Supabase Storage
4. Return the public URL

**Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gemini', () => ({
  genai: {
    models: {
      generateContent: vi.fn()
    }
  }
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://storage.example.com/image.png' }
        })
      }))
    }
  }))
}))

describe('generateAndStoreImage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls Gemini with the prompt and returns storage URL', async () => {
    const { genai } = await import('@/lib/gemini')
    vi.mocked(genai.models.generateContent).mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: 'base64imagedata', mimeType: 'image/png' } }]
        }
      }]
    } as any)

    const { generateAndStoreImage } = await import('../image-gen')
    const url = await generateAndStoreImage({
      prompt: 'A dark castle',
      bucket: 'campaign-images',
      path: 'test/cover.png'
    })
    expect(url).toBe('https://storage.example.com/image.png')
  })

  it('throws when Gemini returns no image data', async () => {
    const { genai } = await import('@/lib/gemini')
    vi.mocked(genai.models.generateContent).mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'No image generated' }] } }]
    } as any)

    const { generateAndStoreImage } = await import('../image-gen')
    await expect(
      generateAndStoreImage({ prompt: 'test', bucket: 'b', path: 'p' })
    ).rejects.toThrow()
  })
})
```

**Step 2: Run tests — fail**

**Step 3: Implement `lib/image-gen.ts`**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: image generation service with Supabase Storage"
```

---

### Task 3: Build Image Generation API Route

**Files:**
- Create: `app/api/campaign/[id]/image/route.ts`
- Create: `app/api/campaign/[id]/image/__tests__/route.test.ts`

**Spec:**

`POST /api/campaign/[id]/image`

Request body:
```json
{
  "type": "cover" | "map" | "scene" | "character",
  "prompt": "A dark castle overlooking a misty valley...",
  "player_id": "optional - for character portraits"
}
```

Behavior:
1. Validate campaign exists
2. Build image prompt with fantasy-appropriate styling prefix
3. Call `generateAndStoreImage` with appropriate bucket/path
4. Update campaign row (`cover_image_url` or `map_image_url`) or player row (`character_image_url`) or message row (`image_url`)
5. Return `{ url }` with status 200

Prompt prefixes by type:
- `cover`: "Fantasy RPG cover art, dark and atmospheric: {prompt}"
- `map`: "Fantasy world map, parchment style, detailed regions: {prompt}"
- `scene`: "Fantasy RPG scene illustration, dramatic lighting: {prompt}"
- `character`: "Fantasy RPG character portrait, detailed, dramatic: {prompt}"

**Step 1: Write tests**

Test cases:
- Returns 404 when campaign doesn't exist
- Returns 400 when type or prompt is missing
- Returns 200 with URL on successful cover generation
- Updates campaign `cover_image_url` in DB for cover type
- Updates campaign `map_image_url` in DB for map type

**Step 2: Run tests — fail**

**Step 3: Implement**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: POST /api/campaign/[id]/image route"
```

---

### Task 4: Trigger Image Generation During Campaign Creation

**Files:**
- Modify: `app/api/campaign/route.ts`

**Updated flow for `POST /api/campaign`:**

After Claude generates WORLD.md, trigger cover and map image generation in parallel (fire-and-forget — don't block the response):

1. Insert campaign row (existing)
2. Call Claude for WORLD.md (existing)
3. Initialize campaign files (existing)
4. **NEW:** Fire-and-forget: generate cover image and map image in parallel
   - Cover prompt: derived from campaign name + world description excerpt
   - Map prompt: derived from WORLD.md geography section
5. Return response immediately (images will update asynchronously)

Since the images are generated asynchronously, the frontend needs to poll or listen for updates. For now, the WorldPreview will show placeholders and the lobby will show images once they're available.

**Step 1: Update tests**

Add test verifying image generation is triggered (but doesn't block response):

```typescript
it('triggers cover and map image generation after world gen', async () => {
  // Mock everything
  // Verify generateAndStoreImage is called twice (cover + map)
  // Verify response returns before images are done
})
```

**Step 2: Run test — fail**

**Step 3: Implement**

Use `Promise.all` with `catch` for error resilience — if image generation fails, it shouldn't break the campaign creation.

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: trigger cover + map image generation during campaign creation"
```

---

### Task 5: Display Images in World Preview

**Files:**
- Modify: `components/campaign/WorldPreview.tsx`

**Spec:**

Update WorldPreview to display cover image and map image:
- If images are available: show them prominently (cover as hero banner, map below world description)
- If images are not yet generated: show loading placeholders with shimmer/skeleton animation
- Add a simple polling mechanism: re-fetch campaign data every 5 seconds until both images are available (max 10 attempts)

**Step 1: Add shadcn skeleton component**

Run: `npx shadcn@latest add skeleton`

**Step 2: Update WorldPreview component**

Add image display with `<Image>` from `next/image` or plain `<img>` with proper sizing. Add skeleton placeholders and polling logic.

**Step 3: Visual test**

- Create a campaign → WorldPreview shows WORLD.md + image placeholders
- After images generate: placeholders replaced with actual images
- Cover image displays as a banner at the top
- Map image displays below the world description

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: display generated images in world preview"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| lib/image-gen.ts | Unit test (vitest) | 2 tests: success flow, no-image-data error |
| POST /api/campaign/[id]/image | Unit test (vitest) | 5 tests: 404, 400, success (cover/map), DB updates |
| Image trigger in campaign creation | Unit test (vitest) | 1 test: verify parallel generation triggered |
| Supabase Storage upload | Manual | Verify images actually upload and URL works |
| WorldPreview with images | Visual/manual | Placeholders → images, polling works |

---

## Acceptance Criteria

- [ ] `lib/image-gen.ts` generates images via Gemini and stores in Supabase Storage (2 tests passing)
- [ ] `POST /api/campaign/[id]/image` generates and stores images by type (5 tests passing)
- [ ] Campaign creation triggers cover + map generation in parallel (1 test passing)
- [ ] WorldPreview displays images with skeleton placeholders while loading
- [ ] Images appear in WorldPreview after generation completes
- [ ] Image generation failure doesn't break campaign creation
- [ ] `yarn build` succeeds
