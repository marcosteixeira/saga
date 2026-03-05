# Images Table Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a central `images` table for status tracking and multi-image support, replace two separate image edge functions with one unified `generate-image` function.

**Architecture:** Polymorphic `images` table (`entity_type` + `entity_id`) tracks all image generation. The unified edge function accepts `{ entity_type, entity_id, image_type }`, creates the images row, generates via Gemini, and denormalizes the URL back to the parent table column (progressive migration — `_url` columns stay for now). Two migrations: create table, then backfill existing URLs.

**Tech Stack:** Supabase migrations (SQL), Deno edge functions (TypeScript), Gemini `gemini-3-pro-image-preview`, Vitest for unit tests.

---

## Context

### Current image URL columns (denormalized, kept as cache)
- `worlds.cover_image_url`, `worlds.map_image_url`
- `sessions.scene_image_url`
- `players.character_image_url`
- `messages.image_url`

### Current edge functions
- `supabase/functions/generate-image/index.ts` — generates world cover/map, called by `generate-world`
- `supabase/functions/generate-scene-image/index.ts` — generates session scene, called by `start-campaign`

### Callers to update
- `supabase/functions/generate-world/index.ts` (line 186–215): calls `generate-image` with `{ world_id, type }`
- `supabase/functions/start-campaign/index.ts` (line 200–222): calls `generate-scene-image` with big payload, uses `GENERATE_SCENE_IMAGE_WEBHOOK_SECRET`

### Broadcast patterns to preserve
- World images: broadcast to channel `world:{world_id}`, event `world:image_ready`, payload `{ type, url }`
- Session images: no broadcast currently — add `image:ready` on `campaign:{campaign_id}`, payload `{ type: 'scene', url, session_id }`

### Test runner
`yarn test` runs Vitest. Edge function tests use `vi.stubGlobal('Deno', ...)` pattern.

---

## Task 1: Migration 010 — Create images table

**Files:**
- Create: `supabase/migrations/010_images_table.sql`

**Step 1: Create the migration file**

```sql
-- supabase/migrations/010_images_table.sql

CREATE TABLE images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  image_type    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  storage_path  TEXT,
  public_url    TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_images_entity ON images(entity_type, entity_id);
CREATE INDEX idx_images_status ON images(status);

-- Reuse set_updated_at() trigger already defined in 001_initial.sql
CREATE TRIGGER images_set_updated_at
BEFORE UPDATE ON images
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `010_images_table` and the SQL above.

**Step 3: Verify table exists**

Use `mcp__supabase__execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'images' ORDER BY ordinal_position;
```
Expected: 10 columns — id, entity_type, entity_id, image_type, status, storage_path, public_url, error, created_at, updated_at.

**Step 4: Commit**

```bash
git add supabase/migrations/010_images_table.sql
git commit -m "feat: add images table for centralized image tracking"
```

---

## Task 2: Migration 011 — Backfill existing images

**Files:**
- Create: `supabase/migrations/011_backfill_images.sql`

**Step 1: Create the migration file**

```sql
-- supabase/migrations/011_backfill_images.sql

-- Worlds: cover images
INSERT INTO images (entity_type, entity_id, image_type, status, storage_path, public_url)
SELECT
  'world',
  id,
  'cover',
  'ready',
  'worlds/' || id || '/cover.png',
  cover_image_url
FROM worlds
WHERE cover_image_url IS NOT NULL;

-- Worlds: map images
INSERT INTO images (entity_type, entity_id, image_type, status, storage_path, public_url)
SELECT
  'world',
  id,
  'map',
  'ready',
  'worlds/' || id || '/map.png',
  map_image_url
FROM worlds
WHERE map_image_url IS NOT NULL;

-- Sessions: scene images
INSERT INTO images (entity_type, entity_id, image_type, status, storage_path, public_url)
SELECT
  'session',
  id,
  'scene',
  'ready',
  'sessions/' || id || '/scene.png',
  scene_image_url
FROM sessions
WHERE scene_image_url IS NOT NULL;

-- Players: character images
INSERT INTO images (entity_type, entity_id, image_type, status, storage_path, public_url)
SELECT
  'player',
  id,
  'character',
  'ready',
  'players/' || id || '/character.png',
  character_image_url
FROM players
WHERE character_image_url IS NOT NULL;

-- Messages: inline images
INSERT INTO images (entity_type, entity_id, image_type, status, storage_path, public_url)
SELECT
  'message',
  id,
  'inline',
  NULL,
  NULL,
  image_url
FROM messages
WHERE image_url IS NOT NULL;
```

**Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `011_backfill_images`.

**Step 3: Verify backfill**

Use `mcp__supabase__execute_sql`:
```sql
SELECT entity_type, image_type, COUNT(*) FROM images GROUP BY entity_type, image_type ORDER BY entity_type;
```
Expected: rows for any entity types that had non-null URLs. Zero rows is also valid if no images exist in the DB yet.

**Step 4: Commit**

```bash
git add supabase/migrations/011_backfill_images.sql
git commit -m "feat: backfill existing image URLs into images table"
```

---

## Task 3: Add Image TypeScript type

**Files:**
- Create: `types/image.ts`
- Modify: `types/index.ts`

**Step 1: Create `types/image.ts`**

```typescript
export type ImageStatus = 'pending' | 'generating' | 'ready' | 'failed'

export type ImageEntityType = 'world' | 'session' | 'player' | 'message'

export type ImageType = 'cover' | 'map' | 'scene' | 'character' | 'inline'

export type Image = {
  id: string
  entity_type: ImageEntityType
  entity_id: string
  image_type: ImageType
  status: ImageStatus
  storage_path: string | null
  public_url: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type ImageInsert = Pick<Image, 'entity_type' | 'entity_id' | 'image_type'>
```

**Step 2: Export from `types/index.ts`**

Add this line to `types/index.ts`:
```typescript
export type { Image, ImageInsert, ImageStatus, ImageEntityType, ImageType } from './image';
```

**Step 3: Commit**

```bash
git add types/image.ts types/index.ts
git commit -m "feat: add Image TypeScript types"
```

---

## Task 4: Rewrite generate-image as unified edge function

**Files:**
- Modify: `supabase/functions/generate-image/index.ts`

The new function:
1. Accepts `{ entity_type, entity_id, image_type }`
2. Inserts `images` row with `status='generating'`
3. Fetches entity data to build prompt (switch on entity_type/image_type)
4. Calls Gemini, uploads PNG
5. Updates `images` row to `status='ready'`
6. Denormalizes URL to parent table column
7. Broadcasts image ready event
8. On failure: sets `status='failed'`, writes error

**Step 1: Write the new index.ts**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { broadcastToChannel } from "../generate-world/broadcast.ts"

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data: string; mimeType: string }
        text?: string
      }>
    }
  }>
}

export function extractImageBytes(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data
  }
  throw new Error("No image data returned from Gemini")
}

export function getStoragePath(entityType: string, entityId: string, imageType: string): string {
  if (entityType === "world") return `worlds/${entityId}/${imageType}.png`
  if (entityType === "session") return `sessions/${entityId}/scene.png`
  if (entityType === "player") return `players/${entityId}/character.png`
  return `${entityType}s/${entityId}/${imageType}.png`
}

const WORLD_IMAGE_SYSTEM_PROMPT = `You are a tabletop RPG background art generator. Generate a single widescreen (16:9 landscape) cinematic scene that will be used as a full-bleed UI background for a web application.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich atmospheric scene content — no large empty or black areas
- The scene should extend edge-to-edge with interesting environmental details throughout
- The LEFT third should have the primary focal point or character
- The RIGHT third can be slightly less busy but must still contain atmospheric scene elements (background, environment, light, fog, etc.) — not darkness or emptiness
- Add only a very subtle dark vignette along the far right edge (last 10% of image width) to help UI text readability
- Add a subtle dark vignette along the bottom edge

VISUAL RULES:
- Do NOT include any text, titles, logos, labels, or typographic elements anywhere in the image
- Do NOT render book cover or movie poster layouts — this is environmental/atmospheric art
- Use deep, rich atmospheric lighting with dramatic shadows
- Genre must be faithfully rendered: crime gets gritty urban realism, sci-fi gets cold tech aesthetics, fantasy gets painterly drama, horror gets dark texture — never default to generic fantasy

Output only the image.`

const SCENE_IMAGE_SYSTEM_PROMPT = `You are a tabletop RPG scene artist. Generate a single widescreen (16:9 landscape) cinematic scene showing a group of adventurers in the described setting.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich atmospheric scene content — no large empty or black areas
- The scene should extend edge-to-edge with interesting environmental details
- Show the party of adventurers as silhouettes or mid-ground figures
- Add a subtle dark vignette along the bottom edge for UI text readability

VISUAL RULES:
- Do NOT include any text, titles, logos, or labels anywhere in the image
- Use deep, rich atmospheric lighting with dramatic shadows
- Genre must be faithfully rendered from the world description

Output only the image.`

async function buildPrompt(
  supabase: ReturnType<typeof createClient>,
  entityType: string,
  entityId: string,
  imageType: string,
): Promise<{ systemPrompt: string; userPrompt: string; campaignId?: string }> {
  if (entityType === "world") {
    const { data: world, error } = await supabase
      .from("worlds")
      .select("world_content")
      .eq("id", entityId)
      .single()
    if (error || !world?.world_content) throw new Error(`world_content not found for world ${entityId}`)
    return {
      systemPrompt: WORLD_IMAGE_SYSTEM_PROMPT,
      userPrompt: world.world_content as string,
    }
  }

  if (entityType === "session") {
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("campaign_id, present_player_ids")
      .eq("id", entityId)
      .single()
    if (sessionError || !session) throw new Error(`session not found: ${entityId}`)

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("world_id")
      .eq("id", session.campaign_id)
      .single()
    if (campaignError || !campaign) throw new Error(`campaign not found for session ${entityId}`)

    const { data: world, error: worldError } = await supabase
      .from("worlds")
      .select("name, world_content")
      .eq("id", campaign.world_id)
      .single()
    if (worldError || !world?.world_content) throw new Error(`world not found for campaign ${session.campaign_id}`)

    const { data: players } = await supabase
      .from("players")
      .select("character_name, character_class, username")
      .eq("campaign_id", session.campaign_id)

    const playerList = (players ?? [])
      .map((p) => `- ${p.character_name ?? p.username} (${p.character_class ?? "unknown class"})`)
      .join("\n")

    return {
      systemPrompt: SCENE_IMAGE_SYSTEM_PROMPT,
      userPrompt: `World: ${world.name}\n\n${world.world_content}\n\nParty:\n${playerList}`,
      campaignId: session.campaign_id,
    }
  }

  throw new Error(`Unsupported entity_type: ${entityType}`)
}

async function denormalizeUrl(
  supabase: ReturnType<typeof createClient>,
  entityType: string,
  entityId: string,
  imageType: string,
  publicUrl: string,
): Promise<void> {
  if (entityType === "world") {
    const column = imageType === "map" ? "map_image_url" : "cover_image_url"
    await supabase.from("worlds").update({ [column]: publicUrl }).eq("id", entityId)
    return
  }
  if (entityType === "session") {
    await supabase.from("sessions").update({ scene_image_url: publicUrl }).eq("id", entityId)
    return
  }
  if (entityType === "player") {
    await supabase.from("players").update({ character_image_url: publicUrl }).eq("id", entityId)
    return
  }
}

async function broadcastImageReady(
  supabaseUrl: string,
  serviceRoleKey: string,
  entityType: string,
  entityId: string,
  imageType: string,
  publicUrl: string,
  campaignId?: string,
): Promise<void> {
  if (entityType === "world") {
    await broadcastToChannel(supabaseUrl, serviceRoleKey, `world:${entityId}`, "world:image_ready", {
      type: imageType,
      url: publicUrl,
    })
    return
  }
  if (entityType === "session" && campaignId) {
    await broadcastToChannel(supabaseUrl, serviceRoleKey, `campaign:${campaignId}`, "image:ready", {
      type: "scene",
      url: publicUrl,
      session_id: entityId,
    })
    return
  }
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get("GENERATE_IMAGE_WEBHOOK_SECRET")
  const authHeader = req.headers.get("authorization")
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  let body: { entity_type?: string; entity_id?: string; image_type?: string }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  const { entity_type, entity_id, image_type } = body
  if (!entity_type || !entity_id || !image_type) {
    return new Response("Missing required fields: entity_type, entity_id, image_type", { status: 400 })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const { createClient } = await import("jsr:@supabase/supabase-js@2")
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // 1. Create images row
  const { data: imageRow, error: insertError } = await supabase
    .from("images")
    .insert({ entity_type, entity_id, image_type, status: "generating" })
    .select("id")
    .single()

  if (insertError || !imageRow) {
    console.error("[generate-image] failed to insert images row", insertError)
    return new Response("Failed to create image record", { status: 500 })
  }

  const imageId = imageRow.id

  try {
    // 2. Build prompt
    const { systemPrompt, userPrompt, campaignId } = await buildPrompt(supabase, entity_type, entity_id, image_type)

    // 3. Call Gemini
    const { GoogleGenerativeAI } = await import("npm:@google/generative-ai")
    const genai = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!)
    const model = genai.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      systemInstruction: systemPrompt,
    })

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        // @ts-ignore
        responseModalities: ["IMAGE"],
      },
    })

    const base64Data = extractImageBytes(result.response as GeminiResponse)
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))
    const storagePath = getStoragePath(entity_type, entity_id, image_type)

    // 4. Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("campaign-images")
      .upload(storagePath, imageBytes, { contentType: "image/png", upsert: true })
    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage.from("campaign-images").getPublicUrl(storagePath)
    const publicUrl = urlData.publicUrl

    // 5. Update images row
    await supabase
      .from("images")
      .update({ status: "ready", storage_path: storagePath, public_url: publicUrl })
      .eq("id", imageId)

    // 6. Denormalize URL to parent table
    await denormalizeUrl(supabase, entity_type, entity_id, image_type, publicUrl)

    // 7. Broadcast
    await broadcastImageReady(supabaseUrl, serviceRoleKey, entity_type, entity_id, image_type, publicUrl, campaignId)

    return new Response(JSON.stringify({ ok: true, url: publicUrl, image_id: imageId }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[generate-image] failed", err)
    await supabase
      .from("images")
      .update({ status: "failed", error: String(err) })
      .eq("id", imageId)
    return new Response("Image generation failed", { status: 500 })
  }
})
```

**Step 2: Commit**

```bash
git add supabase/functions/generate-image/index.ts
git commit -m "feat: unify image generation into single edge function"
```

---

## Task 5: Update generate-image tests

**Files:**
- Modify: `supabase/functions/generate-image/__tests__/index.test.ts`

The tests need to cover `extractImageBytes` (same) and the new `getStoragePath` signature.

**Step 1: Write updated tests**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('Deno', {
  env: { get: () => 'test-value' },
  serve: vi.fn()
});

describe('extractImageBytes', () => {
  it('returns base64 data from Gemini response', async () => {
    const { extractImageBytes } = await import('../index.ts');
    const fakeResponse = {
      candidates: [
        { content: { parts: [{ inlineData: { data: 'abc123base64', mimeType: 'image/png' } }] } }
      ]
    };
    expect(extractImageBytes(fakeResponse as any)).toBe('abc123base64');
  });

  it('throws when no image data in response', async () => {
    const { extractImageBytes } = await import('../index.ts');
    const fakeResponse = {
      candidates: [{ content: { parts: [{ text: 'No image' }] } }]
    };
    expect(() => extractImageBytes(fakeResponse as any)).toThrow('No image data');
  });
});

describe('getStoragePath', () => {
  it('returns correct path for world cover', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('world', 'world-123', 'cover')).toBe('worlds/world-123/cover.png');
  });

  it('returns correct path for world map', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('world', 'world-123', 'map')).toBe('worlds/world-123/map.png');
  });

  it('returns correct path for session scene', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('session', 'session-456', 'scene')).toBe('sessions/session-456/scene.png');
  });

  it('returns correct path for player character', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('player', 'player-789', 'character')).toBe('players/player-789/character.png');
  });
});
```

**Step 2: Run tests**

```bash
yarn test supabase/functions/generate-image/__tests__/index.test.ts
```
Expected: all 6 tests pass.

**Step 3: Commit**

```bash
git add supabase/functions/generate-image/__tests__/index.test.ts
git commit -m "test: update generate-image tests for unified function signature"
```

---

## Task 6: Update generate-world to use new request shape

`generate-world` calls `generate-image` with `{ world_id, type }`. Change to `{ entity_type: 'world', entity_id: world.id, image_type: 'cover' }`.

**Files:**
- Modify: `supabase/functions/generate-world/index.ts` (lines 186–215)

**Step 1: Update the fetch call**

Find this block (around line 186):
```typescript
body: JSON.stringify({
  world_id: world.id,
  type: "cover",
}),
```

Replace with:
```typescript
body: JSON.stringify({
  entity_type: "world",
  entity_id: world.id,
  image_type: "cover",
}),
```

The `Authorization` header and `GENERATE_IMAGE_WEBHOOK_SECRET` env var are unchanged.

**Step 2: Run existing generate-world tests to confirm nothing broke**

```bash
yarn test supabase/functions/generate-world
```
Expected: all tests pass.

**Step 3: Commit**

```bash
git add supabase/functions/generate-world/index.ts
git commit -m "feat: update generate-world to use unified generate-image request shape"
```

---

## Task 7: Update start-campaign to use unified generate-image

`start-campaign` calls `generate-scene-image`. Replace with `generate-image` using the new shape, and switch the secret env var.

**Files:**
- Modify: `supabase/functions/start-campaign/index.ts` (lines 196–222)

**Step 1: Replace the image generation block**

Find this block (around line 196):
```typescript
const sceneSecret = Deno.env.get("GENERATE_SCENE_IMAGE_WEBHOOK_SECRET")
const sceneHeaders: Record<string, string> = { "Content-Type": "application/json" }
if (sceneSecret) sceneHeaders.authorization = `Bearer ${sceneSecret}`

const imagePromise = fetch(`${supabaseUrl}/functions/v1/generate-scene-image`, {
  method: "POST",
  headers: sceneHeaders,
  body: JSON.stringify({
    session_id: session.id,
    campaign_id,
    world_name: world.name,
    world_content: world.world_content,
    player_list: playerList,
  }),
```

Replace with:
```typescript
const imageSecret = Deno.env.get("GENERATE_IMAGE_WEBHOOK_SECRET")
const imageHeaders: Record<string, string> = { "Content-Type": "application/json" }
if (imageSecret) imageHeaders.authorization = `Bearer ${imageSecret}`

const imagePromise = fetch(`${supabaseUrl}/functions/v1/generate-image`, {
  method: "POST",
  headers: imageHeaders,
  body: JSON.stringify({
    entity_type: "session",
    entity_id: session.id,
    image_type: "scene",
  }),
```

Also update the log references from `scene_image` to `image` in the `.then()` and `.catch()` blocks:
```typescript
}).then(async (res) => {
  if (!res.ok) {
    logError(
      "start_campaign.image_failed",
      { requestId, campaign_id, sessionId: session.id, status: res.status },
      new Error(`generate-image responded with ${res.status}`),
    )
  } else {
    logInfo("start_campaign.image_triggered", { requestId, campaign_id, sessionId: session.id })
  }
}).catch((err) => {
  logError("start_campaign.image_fetch_failed", { requestId, campaign_id }, err)
})
```

**Step 2: Commit**

```bash
git add supabase/functions/start-campaign/index.ts
git commit -m "feat: update start-campaign to use unified generate-image"
```

---

## Task 8: Delete generate-scene-image edge function

**Files:**
- Delete: `supabase/functions/generate-scene-image/index.ts`

**Step 1: Delete the function directory**

```bash
rm -rf supabase/functions/generate-scene-image
```

**Step 2: Undeploy from Supabase (if deployed)**

```bash
npx supabase functions delete generate-scene-image
```
If this errors because it's not deployed, ignore it.

**Step 3: Commit**

```bash
git commit -m "feat: remove generate-scene-image (replaced by unified generate-image)"
```

---

## Task 9: Remove GENERATE_SCENE_IMAGE_WEBHOOK_SECRET env var

`GENERATE_SCENE_IMAGE_WEBHOOK_SECRET` is now unused. Remove it from all three places.

**Files:**
- Modify: `.env.local.example`

**Step 1: Remove from `.env.local.example`**

Delete the line:
```
GENERATE_SCENE_IMAGE_WEBHOOK_SECRET=
```

**Step 2: Remove from Supabase edge function secrets**

Run:
```bash
npx supabase secrets unset GENERATE_SCENE_IMAGE_WEBHOOK_SECRET
```

Verify it's gone:
```bash
npx supabase secrets list
```
Expected: `GENERATE_SCENE_IMAGE_WEBHOOK_SECRET` is no longer listed.

**Step 3: Remove from Vercel**

Run:
```bash
npx vercel env rm GENERATE_SCENE_IMAGE_WEBHOOK_SECRET production
npx vercel env rm GENERATE_SCENE_IMAGE_WEBHOOK_SECRET preview
npx vercel env rm GENERATE_SCENE_IMAGE_WEBHOOK_SECRET development
```
Each command will prompt for confirmation — confirm each. If an environment doesn't have the var, the command will error; ignore it.

**Step 4: Commit**

```bash
git add .env.local.example
git commit -m "chore: remove GENERATE_SCENE_IMAGE_WEBHOOK_SECRET env var"
```

---

## Task 10: Deploy updated edge function

**Step 1: Deploy generate-image**

Use `mcp__supabase__deploy_edge_function` with function name `generate-image` and the content of `supabase/functions/generate-image/index.ts`.

**Step 2: Verify deployment**

Use `mcp__supabase__list_edge_functions` and confirm `generate-image` is listed.

**Step 3: Smoke test**

Manually trigger a world image regeneration by calling the function from the Supabase dashboard or via curl with a known `world_id`. Verify:
- A row appears in `images` with `status='ready'`
- `worlds.cover_image_url` is updated
- The `world:image_ready` broadcast fires (check game room loads the image)

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: deploy unified generate-image edge function"
```
