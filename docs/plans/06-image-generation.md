# PR 06: Image Generation (Gemini — Cover Art via generate-world)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After `generate-world` produces world content from Claude, call Gemini to generate a cover image, store it in Supabase Storage, and broadcast a `world:image_ready` event so the setup page can display it as an atmospheric background.

**Architecture:** The `generate-world` Edge Function already handles Claude world gen. This PR extends it: after broadcasting `world:complete`, it fire-and-forgets a call to a new `generate-image` Edge Function — passing only `campaign_id` and `type`. The `generate-image` function fetches WORLD.md from `campaign_files` itself, uses the `## Overview` section as the user prompt to Gemini (with a fixed system prompt for prompt injection defense), uploads the image to Supabase Storage (`campaign-images` bucket), updates `campaigns.cover_image_url`, and broadcasts `world:image_ready` on the campaign channel. The setup page listens and fades in the image as a background.

**Tech Stack:** `@google/generative-ai` (npm, Deno), Gemini `gemini-3-pro-image-preview` (image generation), Supabase Storage, Supabase Realtime broadcast

**Branch:** `feat/06b-image-generation` (`feat/06-image-generation` is already in use)

**Depends on:** PR 05

---

## Design System Reference

All UI work in this PR must follow the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

**Applicable to this PR:**

- **Cover art display:** Full-bleed background at 20% opacity with a gradient vignette (`from-soot/60 via-transparent to-soot/80`) so iron-plate panels remain readable.
- **Image prompts:** The world description drives the image style entirely — no hardcoded aesthetic prefix. The system prompt instructs Gemini to produce fantasy RPG cover art faithful to the world described.
- **Fade-in transition:** `transition-opacity duration-1000` when image URL arrives via broadcast.

---

## Supabase Storage Setup

### Task 1: Create `campaign-images` Storage Bucket

**Step 1: Apply migration**

Apply via Supabase MCP `apply_migration` with name `create_campaign_images_bucket`:

```sql
-- Create the campaign-images bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-images', 'campaign-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on all objects in campaign-images
CREATE POLICY "Public read campaign images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-images');

-- Allow service role inserts (Edge Functions use service role key)
CREATE POLICY "Service role write campaign images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'campaign-images');
```

**Step 2: Verify bucket appears in Supabase dashboard → Storage tab**

**Step 3: Commit**

```bash
git add supabase/migrations/ && git commit -m "chore: create campaign-images storage bucket"
```

---

## generate-image Edge Function

### Task 2: Create `generate-image` Edge Function

**Files:**

- Create: `supabase/functions/generate-image/index.ts`
- Create: `supabase/functions/generate-image/__tests__/index.test.ts`

**Spec:** `POST /functions/v1/generate-image`

Request body:

```json
{
  "campaign_id": "uuid",
  "type": "cover"
}
```

Behavior:

1. Validate auth header against `GENERATE_IMAGE_WEBHOOK_SECRET`
2. Validate `campaign_id` is present
3. Fetch WORLD.md content from `campaign_files` table (where `campaign_id` matches and `filename = 'WORLD.md'`)
4. Use the full WORLD.md content as the user prompt
5. Call Gemini `gemini-3-pro-image-preview` with a **system prompt** (image style instructions) and a **user message** (the overview text — untrusted world content goes here, never in the system prompt)
6. Extract base64 image bytes from response
7. Upload to Supabase Storage at `campaign-images/{campaign_id}/{type}.png`
8. Get public URL
9. Update `campaigns.cover_image_url` (or `map_image_url` for `type: "map"`)
10. Broadcast `world:image_ready` on `campaign:{campaign_id}` with `{ type, url }`
11. Return `{ ok: true, url }`

**System prompt** (fixed, never contains user content):

```
You are a fantasy RPG cover art generator. Generate a single dramatic, cinematic cover image faithfully depicting the world described by the user. Use rich atmospheric lighting, detailed environments, and an epic fantasy art style. Output only the image.
```

**Step 1: Write tests**

```typescript
// supabase/functions/generate-image/__tests__/index.test.ts
import { describe, it, expect, vi } from 'vitest';

// We export and test pure helper functions independently of Deno.serve
vi.stubGlobal('Deno', {
  env: { get: () => 'test-value' },
  serve: vi.fn()
});


describe('extractImageBytes', () => {
  it('returns base64 data from Gemini response', async () => {
    const { extractImageBytes } = await import('../index.ts');
    const fakeResponse = {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: 'abc123base64', mimeType: 'image/png' } }]
          }
        }
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
  it('returns correct path for cover type', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('campaign-123', 'cover')).toBe('campaign-123/cover.png');
  });

  it('returns correct path for map type', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('campaign-123', 'map')).toBe('campaign-123/map.png');
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
cd supabase/functions/generate-image
deno test --allow-env __tests__/index.test.ts
```

Expected: module not found or import error.

**Step 3: Implement `supabase/functions/generate-image/index.ts`**

```typescript
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// System prompt is fixed and never contains user-controlled content.
// User content (full WORLD.md) goes only in the user message.
const IMAGE_SYSTEM_PROMPT =
  'You are a fantasy RPG cover art generator. Generate a single dramatic, cinematic cover image faithfully depicting the world described by the user. Use rich atmospheric lighting, detailed environments, and an epic fantasy art style. Output only the image.';

export function extractImageBytes(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }>;
    };
  }>;
}): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }
  throw new Error('No image data returned from Gemini');
}

export function getStoragePath(campaignId: string, type: string): string {
  return `${campaignId}/${type}.png`;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function broadcastImageReady(
  campaignId: string,
  type: string,
  url: string
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `campaign:${campaignId}`,
            event: 'world:image_ready',
            payload: { type, url }
          }
        ]
      })
    });
    if (!res.ok) {
      console.error(`[generate-image] broadcast failed HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('[generate-image] broadcast threw', err);
  }
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get('GENERATE_IMAGE_WEBHOOK_SECRET');
  const authHeader = req.headers.get('authorization');
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { campaign_id?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { campaign_id, type = 'cover' } = body;
  if (!campaign_id) {
    return new Response('Missing campaign_id', { status: 400 });
  }

  try {
    // Fetch WORLD.md from the database — keep user content out of the system prompt
    const { data: fileRow, error: fileError } = await supabase
      .from('campaign_files')
      .select('content')
      .eq('campaign_id', campaign_id)
      .eq('filename', 'WORLD.md')
      .single();

    if (fileError || !fileRow?.content) {
      throw new Error(`WORLD.md not found for campaign ${campaign_id}`);
    }

    const userPrompt = fileRow.content;

    const genai = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!);
    const model = genai.getGenerativeModel({
      model: 'gemini-3-pro-image-preview',
      systemInstruction: IMAGE_SYSTEM_PROMPT
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        // @ts-ignore: responseModalities not yet in TS types
        responseModalities: ['IMAGE']
      }
    });

    const base64Data = extractImageBytes(result.response as any);
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const storagePath = getStoragePath(campaign_id, type);

    const { error: uploadError } = await supabase.storage
      .from('campaign-images')
      .upload(storagePath, imageBytes, { contentType: 'image/png', upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('campaign-images')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;
    const column = type === 'map' ? 'map_image_url' : 'cover_image_url';

    await supabase
      .from('campaigns')
      .update({ [column]: publicUrl })
      .eq('id', campaign_id);

    await broadcastImageReady(campaign_id, type, publicUrl);

    return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[generate-image] failed', err);
    return new Response('Image generation failed', { status: 500 });
  }
});
```

**Step 4: Run tests — verify they pass**

```bash
deno test --allow-env __tests__/index.test.ts
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add supabase/functions/generate-image/ && git commit -m "feat: generate-image Edge Function with Gemini + Supabase Storage"
```

---

### Task 3: Fire Image Generation from `generate-world` After World Complete

**Files:**

- Modify: `supabase/functions/generate-world/index.ts`

**Where:** After the `broadcastToChannel(..., "world:complete", ...)` call (~line 171), before the final `return`.

**Step 1: Add fire-and-forget call**

No import changes needed — `generate-image` fetches the world content itself.

After `broadcastToChannel(supabaseUrl, serviceRoleKey, campaign.id, "world:complete", { status: "lobby" })`, add:

```typescript
// Fire-and-forget: generate cover image in background
// Do NOT await — image gen takes 15-30s and must not block the response
// generate-image fetches WORLD.md itself; we pass only the campaign_id
const imageWebhookSecret = Deno.env.get('GENERATE_IMAGE_WEBHOOK_SECRET');
fetch(`${supabaseUrl}/functions/v1/generate-image`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${imageWebhookSecret}`
  },
  body: JSON.stringify({
    campaign_id: campaign.id,
    type: 'cover'
  })
}).catch((err) => {
  logError(
    'generate_world.image_trigger_failed',
    { requestId, campaignId: campaign.id },
    err
  );
});
```

**Step 3: Visual verification**

Create a campaign → check Supabase logs for `generate-image` function invocation ~5-30s after world gen completes.

**Step 4: Commit**

```bash
git add supabase/functions/generate-world/index.ts && git commit -m "feat: trigger cover image generation after world gen completes"
```

---

### Task 4: Update Setup Page to Show Cover Image as Background

**Files:**

- Modify: `app/campaign/[id]/setup/page.tsx`

**Step 1: Add `coverImageUrl` state**

```typescript
const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
```

**Step 2: Populate from `loadCampaign`**

Inside `loadCampaign`, after `setCampaign(data.campaign)`:

```typescript
if (data.campaign.cover_image_url) {
  setCoverImageUrl(data.campaign.cover_image_url);
}
```

**Step 3: Listen for `world:image_ready` broadcast**

In the channel subscription block (inside `useEffect`), add a new `.on(...)` handler:

```typescript
.on('broadcast', { event: 'world:image_ready' }, (message: { payload: { type: string; url: string } }) => {
  if (!mounted) return
  if (message.payload.type === 'cover') {
    setCoverImageUrl(message.payload.url)
  }
})
```

**Step 4: Render cover image as background**

In the JSX, inside `<main className="relative min-h-screen bg-soot">`, add as the **first child** (before `<GearDecoration />`):

```tsx
{
  coverImageUrl && (
    <div className="absolute inset-0 z-0 transition-opacity duration-1000">
      <img
        src={coverImageUrl}
        alt="Campaign world cover art"
        className="h-full w-full object-cover opacity-20"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-soot/60 via-transparent to-soot/80" />
    </div>
  );
}
```

**Step 5: Visual test**

1. Create a campaign → setup page shows spinner
2. ~20-60s later: cover image fades in as a dim atmospheric background
3. Iron-plate panels remain readable over the background
4. Refresh the page with `status: 'lobby'` → image loads immediately from DB

**Step 6: Commit**

```bash
git add app/campaign/ && git commit -m "feat: display cover image as atmospheric background on setup page"
```

---

### Task 5: Environment Variables

**Step 1: Add secrets to Supabase**

```bash
supabase secrets set GENERATE_IMAGE_WEBHOOK_SECRET=<generate-a-random-secret>
supabase secrets set GEMINI_API_KEY=<your-gemini-api-key>
```

The same `GENERATE_IMAGE_WEBHOOK_SECRET` must also be available to `generate-world` (which already reads env vars from Supabase secrets).

**Step 2: Deploy both Edge Functions**

```bash
supabase functions deploy generate-image
supabase functions deploy generate-world
```

**Step 3: Verify**

```bash
supabase functions list
```

Both should appear as deployed.

**Step 4: Commit any `.env.local.example` updates**

```bash
git add .env.local.example && git commit -m "chore: document GEMINI_API_KEY and GENERATE_IMAGE_WEBHOOK_SECRET"
```

---

## Testing Strategy

| What                | How              | Detail                                                          |
| ------------------- | ---------------- | --------------------------------------------------------------- |
| `extractImageBytes` | Unit (deno test) | Returns base64, throws on missing                               |
| `getStoragePath`    | Unit (deno test) | Correct paths for cover/map                                     |
| Full integration    | Manual           | Create campaign → cover image appears on setup page             |
| Prompt injection    | Manual           | World description with injected instructions → image still generates normally |
| Error resilience    | Manual           | Invalid GEMINI_API_KEY → world gen still reaches `lobby` status |

---

## Acceptance Criteria

- [ ] `campaign-images` Supabase Storage bucket exists and is publicly readable
- [ ] `generate-image` Edge Function deploys and returns `{ ok: true, url }` for valid requests
- [ ] `generate-world` fires `generate-image` after broadcasting `world:complete` (non-blocking)
- [ ] Setup page listens for `world:image_ready` and displays cover image as background
- [ ] Setup page loads cover image from DB on page refresh if already generated
- [ ] World generation still completes (status → `lobby`) even if image generation fails
- [ ] 4 unit tests pass in `generate-image` (`extractImageBytes` ×2, `getStoragePath` ×2)
- [ ] `yarn build` succeeds
