# World Map Image Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate a cartographic map image in parallel with the cover image, store it in `map_image_url`, and display it live on the setup page via Supabase Realtime.

**Architecture:** The existing `generate-image` edge function already supports `type: "map"` for storage path and DB column selection — it just uses the wrong prompt. We add a dedicated `MAP_SYSTEM_PROMPT` and a `getSystemPrompt(type)` selector. We then fire a second parallel fetch in `generate-world` (same `EdgeRuntime.waitUntil` pattern). The setup page adds a `mapImageUrl` state and handles `type === 'map'` in the existing `world:image_ready` listener.

**Tech Stack:** Deno / Supabase Edge Functions, Gemini image API (`gemini-3-pro-image-preview`), Supabase Realtime broadcast, Next.js / React

---

### Task 1: Add `MAP_SYSTEM_PROMPT` and `getSystemPrompt(type)` helper

**Context:** `generate-image/index.ts` hardcodes `IMAGE_SYSTEM_PROMPT` in the model call. We need a cartographic prompt for `type === 'map'` and a clean selector function that is exported so it can be unit-tested.

**Files:**
- Modify: `supabase/functions/generate-image/index.ts`
- Test: `supabase/functions/generate-image/__tests__/index.test.ts`

---

**Step 1: Write the failing test**

Open `supabase/functions/generate-image/__tests__/index.test.ts` and append:

```typescript
describe('getSystemPrompt', () => {
  it('returns MAP_SYSTEM_PROMPT for type "map"', async () => {
    const { getSystemPrompt } = await import('../index.ts');
    const prompt = getSystemPrompt('map');
    expect(prompt).toContain('cartographic');
  });

  it('returns IMAGE_SYSTEM_PROMPT for type "cover"', async () => {
    const { getSystemPrompt } = await import('../index.ts');
    const prompt = getSystemPrompt('cover');
    expect(prompt).toContain('tabletop RPG background art');
  });

  it('returns IMAGE_SYSTEM_PROMPT for unknown type', async () => {
    const { getSystemPrompt } = await import('../index.ts');
    const prompt = getSystemPrompt('other');
    expect(prompt).toContain('tabletop RPG background art');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run supabase/functions/generate-image/__tests__/index.test.ts
```

Expected: FAIL — `getSystemPrompt is not a function` (or similar export error).

**Step 3: Implement `MAP_SYSTEM_PROMPT` and `getSystemPrompt` in `generate-image/index.ts`**

Add after the existing `IMAGE_SYSTEM_PROMPT` constant (before `extractImageBytes`):

```typescript
// Prompt for cartographic/aerial map images. Fixed content — no user input.
const MAP_SYSTEM_PROMPT = `You are a cartographic illustrator for tabletop RPG worlds. Generate a single top-down aerial world map rendered in a painterly fantasy cartography style, suitable for use as a full-bleed UI background.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich map content — landmasses, oceans, forests, mountains, rivers, cities, roads
- Use warm parchment or aged vellum tones as the background, as though drawn on old paper
- Include subtle compass rose, coastline hatching, and illustrated terrain icons (mountain ridges, tree clusters, settlements)
- The map should feel hand-drawn with ink and watercolor washes, not photorealistic
- Do NOT leave large empty or uniform areas — every region should have detail

VISUAL RULES:
- Do NOT include any text labels, city names, region names, legends, or any typographic elements
- Match the genre: a sci-fi world gets star-chart / colony-map aesthetics; a horror world gets dark, decayed cartography; fantasy gets classic illustrated maps
- Use rich, saturated but antique-feeling colors

Output only the image.`

export function getSystemPrompt(type: string): string {
  return type === 'map' ? MAP_SYSTEM_PROMPT : IMAGE_SYSTEM_PROMPT
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run supabase/functions/generate-image/__tests__/index.test.ts
```

Expected: All tests PASS (including the new `getSystemPrompt` suite and previously existing tests).

**Step 5: Commit**

```bash
git add supabase/functions/generate-image/index.ts supabase/functions/generate-image/__tests__/index.test.ts
git commit -m "feat(generate-image): add MAP_SYSTEM_PROMPT and getSystemPrompt selector"
```

---

### Task 2: Wire `getSystemPrompt` into the Deno handler

**Context:** Inside `Deno.serve`, the model is constructed with `systemInstruction: IMAGE_SYSTEM_PROMPT` hardcoded. Replace it with `getSystemPrompt(type)` so map requests use the cartographic prompt.

**Files:**
- Modify: `supabase/functions/generate-image/index.ts`

There is no new unit test needed here — the handler is an integration concern. The existing `getStoragePath` and `extractImageBytes` tests already cover the pure functions; the prompt selection is covered by Task 1's tests.

**Step 1: Update the handler**

In `supabase/functions/generate-image/index.ts`, inside `Deno.serve`, find:

```typescript
    const model = genai.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      systemInstruction: IMAGE_SYSTEM_PROMPT,
    })
```

Replace with:

```typescript
    const model = genai.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
      systemInstruction: getSystemPrompt(type),
    })
```

**Step 2: Run all generate-image tests**

```bash
npx vitest run supabase/functions/generate-image/__tests__/index.test.ts
```

Expected: All PASS (no regressions).

**Step 3: Commit**

```bash
git add supabase/functions/generate-image/index.ts
git commit -m "feat(generate-image): use getSystemPrompt in handler — map requests now use cartographic prompt"
```

---

### Task 3: Trigger map generation in parallel from `generate-world`

**Context:** `generate-world/index.ts` currently fires one `fetch` to `generate-image` with `type: "cover"` and wraps it in `EdgeRuntime.waitUntil`. We do the same for `type: "map"`, combining both promises into a single `waitUntil` call.

**Files:**
- Modify: `supabase/functions/generate-world/index.ts`

There is no isolated unit test for this (the function is an HTTP handler with side effects). The integration is verified by manual smoke-test or E2E; TDD is satisfied at the unit level in Task 1.

**Step 1: Update the image-trigger section**

Find this block near the end of `Deno.serve` in `generate-world/index.ts`:

```typescript
    // Trigger image generation
    const imageWebhookSecret = Deno.env.get("GENERATE_IMAGE_WEBHOOK_SECRET")
    const imagePromise = fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${imageWebhookSecret}`,
      },
      body: JSON.stringify({
        world_id: world.id,
        type: "cover",
      }),
    }).then((res) => {
      if (!res.ok) {
        logError(
          "generate_world.image_trigger_failed",
          { requestId, worldId: world.id, status: res.status },
          new Error(`generate-image responded with ${res.status}`),
        )
      } else {
        logInfo("generate_world.image_trigger_succeeded", {
          requestId,
          worldId: world.id,
        })
      }
    }).catch((err) => {
      logError(
        "generate_world.image_trigger_failed",
        { requestId, worldId: world.id },
        err,
      )
    })
    // @ts-ignore — EdgeRuntime is available in Supabase edge function environments
    EdgeRuntime.waitUntil(imagePromise)
```

Replace with:

```typescript
    // Trigger cover and map image generation in parallel
    const imageWebhookSecret = Deno.env.get("GENERATE_IMAGE_WEBHOOK_SECRET")

    function triggerImage(type: string): Promise<void> {
      return fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${imageWebhookSecret}`,
        },
        body: JSON.stringify({ world_id: world.id, type }),
      }).then((res) => {
        if (!res.ok) {
          logError(
            "generate_world.image_trigger_failed",
            { requestId, worldId: world.id, type, status: res.status },
            new Error(`generate-image responded with ${res.status}`),
          )
        } else {
          logInfo("generate_world.image_trigger_succeeded", { requestId, worldId: world.id, type })
        }
      }).catch((err) => {
        logError("generate_world.image_trigger_failed", { requestId, worldId: world.id, type }, err)
      })
    }

    const imagesPromise = Promise.all([triggerImage("cover"), triggerImage("map")])
    // @ts-ignore — EdgeRuntime is available in Supabase edge function environments
    EdgeRuntime.waitUntil(imagesPromise)
```

**Step 2: Verify no TypeScript errors**

```bash
cd supabase/functions/generate-world && deno check index.ts
```

Expected: No errors. (If `deno` is not in PATH locally, skip — CI will catch it.)

**Step 3: Commit**

```bash
git add supabase/functions/generate-world/index.ts
git commit -m "feat(generate-world): trigger map image generation in parallel with cover"
```

---

### Task 4: Display map image on setup page with Realtime live update

**Context:** `app/campaign/[id]/setup/page.tsx` already:
- Holds `coverImageUrl` state and sets it on `world:image_ready` when `type === 'cover'`
- Displays the cover as a full-bleed background

We need to:
1. Add `mapImageUrl` state
2. Handle `type === 'map'` in the Realtime listener
3. Seed `mapImageUrl` from the initial DB load
4. Display the map image in the status panel (smaller inset, distinct from the cover background)

No test framework is currently set up for Next.js pages in this project. The TDD requirement is satisfied by unit tests in Tasks 1 and 2. The setup page change is a presentational wiring change verified by manual review.

**Step 1: Add `mapImageUrl` state**

In `app/campaign/[id]/setup/page.tsx`, find the existing state declarations:

```typescript
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
```

Add below them:

```typescript
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null)
```

**Step 2: Seed `mapImageUrl` from initial DB load**

In `loadCampaign`, find:

```typescript
    if (data.world.cover_image_url) {
      setCoverImageUrl(`${data.world.cover_image_url}?t=${Date.now()}`)
    }
```

Add below it:

```typescript
    if (data.world.map_image_url) {
      setMapImageUrl(`${data.world.map_image_url}?t=${Date.now()}`)
    }
```

**Step 3: Handle `type === 'map'` in the Realtime listener**

Find the existing `world:image_ready` handler:

```typescript
          .on(
            'broadcast',
            { event: 'world:image_ready' },
            (message: { payload: { type: string; url: string } }) => {
              if (!mounted) return
              if (message.payload.type === 'cover') {
                setImageLoaded(false)
                setCoverImageUrl(message.payload.url)
              }
            }
          )
```

Replace with:

```typescript
          .on(
            'broadcast',
            { event: 'world:image_ready' },
            (message: { payload: { type: string; url: string } }) => {
              if (!mounted) return
              if (message.payload.type === 'cover') {
                setImageLoaded(false)
                setCoverImageUrl(message.payload.url)
              } else if (message.payload.type === 'map') {
                setMapImageUrl(message.payload.url)
              }
            }
          )
```

**Step 4: Display the map image in the status panel**

Find the cover image status hint inside the `iron-plate` div:

```typescript
              {/* Cover image status */}
              {!pageLoading && (busy || isComplete) && !hasImage && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-white/20"
                      style={{ animation: 'pulse 2s ease-in-out infinite' }}
                    />
                    <span className="text-sm text-steam/80">Cover art being forged in the background...</span>
                  </div>
                </div>
              )}
```

Replace with:

```typescript
              {/* Image status hints */}
              {!pageLoading && (busy || isComplete) && (
                <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
                  {!hasImage && (
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-white/20"
                        style={{ animation: 'pulse 2s ease-in-out infinite' }}
                      />
                      <span className="text-sm text-steam/80">Cover art being forged in the background...</span>
                    </div>
                  )}
                  {!mapImageUrl && (
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-white/20"
                        style={{ animation: 'pulse 2s ease-in-out infinite' }}
                      />
                      <span className="text-sm text-steam/80">World map being charted in the background...</span>
                    </div>
                  )}
                  {mapImageUrl && (
                    <div className="mt-2">
                      <p className="text-xs text-steam/50 uppercase tracking-widest mb-2">World Map</p>
                      <img
                        src={mapImageUrl}
                        alt="World map"
                        className="w-full rounded border border-white/10"
                        style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                      />
                    </div>
                  )}
                </div>
              )}
```

**Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 6: Commit**

```bash
git add app/campaign/[id]/setup/page.tsx
git commit -m "feat(setup): display map image with Realtime live update"
```

---

## Smoke Test Checklist

After deploying, verify end-to-end:

1. Create a new campaign and navigate to the setup page
2. Confirm "Cover art being forged..." and "World map being charted..." both appear
3. Confirm cover image fades in as the background when `world:image_ready` with `type: 'cover'` arrives
4. Confirm map image appears in the status panel when `world:image_ready` with `type: 'map'` arrives
5. Reload the page after both images are ready — confirm both load from DB without Realtime
