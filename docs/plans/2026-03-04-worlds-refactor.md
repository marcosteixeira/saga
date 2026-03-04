# Worlds Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract world data from campaigns into a reusable `worlds` table so the same world can power multiple campaigns.

**Architecture:** A new `worlds` table owns all world-level data: the raw description, generated lore (previously WORLD.md in `campaign_files`), cover image, map image, and generation status. Campaigns reference a `world_id` FK instead of storing world data inline. The `generate-world` edge function now operates on a world record instead of a campaign record. The `generate-image` edge function reads `worlds.world_content` instead of `campaign_files.WORLD.md`. Campaign creation accepts either an existing `world_id` or a new world description; when a new description is provided, the API creates the world first, then the campaign.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + Realtime + Storage), Supabase Edge Functions (Deno), shadcn/ui

---

## Current State Summary

Key facts an implementer needs to know:

- `campaigns` table has `world_description TEXT`, `cover_image_url TEXT`, `map_image_url TEXT`, `status` (includes `'generating'` for world gen in progress)
- `campaign_files` table stores 5 markdown files per campaign: `WORLD.md`, `CHARACTERS.md`, `NPCS.md`, `LOCATIONS.md`, `MEMORY.md`
- `generate-world` edge function receives `{ record: { id, world_description } }` (campaign record), writes WORLD.md to `campaign_files`, updates `campaigns.status → 'lobby'`, then triggers `generate-image`
- `generate-image` edge function reads `campaign_files.WORLD.md`, uploads to storage at `{campaign_id}/{type}.png`, updates `campaigns.cover_image_url` / `map_image_url`, broadcasts `world:image_ready` on channel `campaign:{campaign_id}`
- `POST /api/campaign` creates campaign with `status: 'generating'`, fire-and-forgets `generate-world`
- `GET /api/campaign/[id]` returns `{ campaign, players, files }` — files includes WORLD.md
- `/campaign/[id]/setup` page subscribes to Realtime channel `campaign:{campaignId}`, listens for `world:started`, `world:complete`, `world:error`, `world:image_ready`
- `lib/memory.ts` has `initializeCampaignFiles(campaignId, worldContent)` which writes all 5 files including WORLD.md

## What Changes

| Before                                               | After                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `campaigns.world_description`                        | `worlds.description`                                             |
| `campaigns.cover_image_url`                          | `worlds.cover_image_url`                                         |
| `campaigns.map_image_url`                            | `worlds.map_image_url`                                           |
| `campaigns.status = 'generating'` (for world gen)    | `worlds.status = 'generating'`                                   |
| `campaign_files.WORLD.md`                            | `worlds.world_content TEXT`                                      |
| `generate-world` gets campaign record                | `generate-world` gets world record                               |
| `generate-image` reads campaign_files                | `generate-image` reads worlds.world_content                      |
| `generate-image` stores at `{campaign_id}/cover.png` | stores at `worlds/{world_id}/cover.png`                          |
| `generate-image` updates campaigns table             | updates worlds table                                             |
| Realtime broadcasts on `campaign:{id}`               | broadcasts on `world:{id}`                                       |
| Campaign creation always creates a world             | Campaign creation accepts existing `world_id` OR new description |

## Broadcast Channel Change

The setup page currently subscribes to `campaign:{campaignId}` for world generation events. After the refactor, these events broadcast on `world:{worldId}`. The setup page will need to know the `world_id` to subscribe to the right channel. Since campaign creation now resolves in two steps (create world → create campaign), the setup page URL will remain `/campaign/[id]/setup` but will subscribe to `world:{campaign.world_id}`.

---

## Task 1: Database Migration — `worlds` Table

**Files:**

- Create: `supabase/migrations/005_worlds_table.sql`

This migration creates the `worlds` table, updates `campaigns` to reference it, and migrates existing data.

**Step 1: Write the migration**

```sql
-- supabase/migrations/005_worlds_table.sql

-- 1. Create worlds table
CREATE TABLE worlds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  world_content     TEXT,
  cover_image_url   TEXT,
  map_image_url     TEXT,
  status            TEXT NOT NULL DEFAULT 'generating',
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 2. Index for listing user's worlds
CREATE INDEX idx_worlds_user_id ON worlds(user_id);

-- 3. Add world_id FK to campaigns (nullable initially for migration)
ALTER TABLE campaigns ADD COLUMN world_id UUID REFERENCES worlds(id) ON DELETE SET NULL;

-- 4. Migrate existing campaigns: create a world record for each campaign
-- This preserves all existing data by extracting it into the new structure.
INSERT INTO worlds (id, user_id, name, description, world_content, cover_image_url, map_image_url, status, created_at)
SELECT
  gen_random_uuid(),
  c.host_user_id,
  c.name,
  c.world_description,
  cf.content,
  c.cover_image_url,
  c.map_image_url,
  CASE c.status
    WHEN 'generating' THEN 'generating'
    WHEN 'error'      THEN 'error'
    ELSE 'ready'
  END,
  c.created_at
FROM campaigns c
LEFT JOIN campaign_files cf
  ON cf.campaign_id = c.id AND cf.filename = 'WORLD.md';

-- 5. Link each campaign to its newly created world
-- We match by host_user_id + name + created_at (unique enough for migration)
UPDATE campaigns c
SET world_id = w.id
FROM worlds w
WHERE w.user_id = c.host_user_id
  AND w.name    = c.name
  AND w.created_at = c.created_at;

-- 6. Make world_id NOT NULL now that all campaigns are linked
ALTER TABLE campaigns ALTER COLUMN world_id SET NOT NULL;

-- 7. Remove world data columns from campaigns
ALTER TABLE campaigns DROP COLUMN world_description;
ALTER TABLE campaigns DROP COLUMN cover_image_url;
ALTER TABLE campaigns DROP COLUMN map_image_url;

-- 8. Remove WORLD.md from campaign_files (now lives in worlds.world_content)
DELETE FROM campaign_files WHERE filename = 'WORLD.md';

-- 9. Enable RLS on worlds
ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;

-- Owners can see their own worlds
CREATE POLICY "worlds_select_owner"
  ON worlds FOR SELECT
  USING (auth.uid() = user_id);

-- Owners can insert worlds
CREATE POLICY "worlds_insert_owner"
  ON worlds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Owners can update their own worlds
CREATE POLICY "worlds_update_owner"
  ON worlds FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (edge functions) can do anything — covered by service role key bypass
-- No additional policy needed.

-- 10. Add worlds to realtime publication so clients can subscribe to Postgres Changes
ALTER PUBLICATION supabase_realtime ADD TABLE worlds;
```

**Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase Dashboard SQL editor)

Expected: No errors. Check the Supabase Dashboard → Table Editor to confirm `worlds` table exists and campaigns have `world_id` populated.

**Step 3: Commit**

```bash
git add supabase/migrations/005_worlds_table.sql
git commit -m "feat: add worlds table and migrate existing campaign world data"
```

---

## Task 2: TypeScript Types

**Files:**

- Create: `types/world.ts`
- Modify: `types/campaign.ts`
- Modify: `types/index.ts`

**Step 1: Create `types/world.ts`**

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

**Step 2: Update `types/campaign.ts`**

Remove `world_description`, `cover_image_url`, `map_image_url` from `Campaign`. Add `world_id`. Update `CampaignInsert` accordingly.

```typescript
export type Campaign = {
  id: string;
  name: string;
  host_username: string;
  host_user_id: string;
  world_id: string;
  system_description: string | null;
  status: 'lobby' | 'active' | 'paused' | 'ended';
  turn_mode: 'free' | 'sequential';
  turn_timer_seconds: number;
  current_session_id: string | null;
  created_at: string;
};

export type CampaignInsert = Pick<
  Campaign,
  'name' | 'host_username' | 'host_user_id' | 'world_id'
> & {
  system_description?: string;
};
```

Note: `'generating'` and `'error'` are removed from `Campaign.status` — those states now live on `World.status`.

**Step 3: Update `types/index.ts`**

```typescript
export type { Campaign, CampaignInsert } from './campaign';
export type { Player, PlayerInsert } from './player';
export type { Message, MessageInsert } from './message';
export type { CampaignFile, CampaignFileInsert } from './campaign-file';
export type { Session, SessionInsert } from './session';
export type { World, WorldInsert, WorldStatus } from './world';
```

**Step 4: Run TypeScript check**

Run: `yarn tsc --noEmit`

Expected: Type errors will appear in files that reference the removed campaign fields — that's expected and will be fixed in subsequent tasks. Verify that the types themselves compile cleanly.

**Step 5: Commit**

```bash
git add types/world.ts types/campaign.ts types/index.ts
git commit -m "feat: add World type, remove world fields from Campaign type"
```

---

## Task 3: Update `lib/memory.ts`

**Files:**

- Modify: `lib/memory.ts`

`initializeCampaignFiles` currently writes WORLD.md as one of the 5 files. After the refactor, WORLD.md no longer belongs to a campaign — it lives in `worlds.world_content`. Remove it from initialization.

**Step 1: Update `initializeCampaignFiles`**

The function signature changes: it no longer accepts `worldContent` since that goes to the world record directly.

```typescript
// lib/memory.ts

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CampaignFile } from '@/types';

export async function getCampaignFile(
  campaignId: string,
  filename: string
): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('campaign_files')
    .select('content')
    .eq('campaign_id', campaignId)
    .eq('filename', filename)
    .single();
  if (error || !data) return null;
  return data.content;
}

export async function getCampaignFiles(campaignId: string): Promise<CampaignFile[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('campaign_files')
    .select('*')
    .eq('campaign_id', campaignId);
  return data ?? [];
}

export async function upsertCampaignFile(
  campaignId: string,
  filename: string,
  content: string
): Promise<void> {
  const supabase = createServerSupabaseClient();
  await supabase
    .from('campaign_files')
    .upsert(
      { campaign_id: campaignId, filename, content },
      { onConflict: 'campaign_id,filename' }
    );
}

export async function initializeCampaignFiles(campaignId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const files = [
    { campaign_id: campaignId, filename: 'CHARACTERS.md', content: '' },
    { campaign_id: campaignId, filename: 'NPCS.md', content: '' },
    { campaign_id: campaignId, filename: 'LOCATIONS.md', content: '' },
    { campaign_id: campaignId, filename: 'MEMORY.md', content: 'Campaign just started.' }
  ];
  for (const file of files) {
    await supabase
      .from('campaign_files')
      .upsert(file, { onConflict: 'campaign_id,filename' });
  }
}
```

**Step 2: Run TypeScript check**

Run: `yarn tsc --noEmit`

Expected: Errors about call sites that pass `worldContent` to `initializeCampaignFiles` — will be fixed in the edge function task.

**Step 3: Commit**

```bash
git add lib/memory.ts
git commit -m "refactor: remove WORLD.md from campaign file initialization"
```

---

## Task 4: Update `generate-world` Edge Function

**Files:**

- Modify: `supabase/functions/generate-world/index.ts`

The edge function now receives a **world** record (not a campaign record). It:

1. Reads `world.description` (not `campaign.world_description`)
2. Writes generated content to `worlds.world_content` (not `campaign_files.WORLD.md`)
3. Initializes 4 campaign files (not 5 — WORLD.md is gone) for the **campaign** linked to this world
4. Updates `worlds.status → 'ready'` (not `campaigns.status → 'lobby'`)
5. Broadcasts on channel `world:{worldId}` (not `campaign:{campaignId}`)
6. Triggers `generate-image` with `world_id` (not `campaign_id`)

**Step 1: Update `supabase/functions/generate-world/index.ts`**

```typescript
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getMissingRequiredSections } from './world-content.ts';
import { logError, logInfo } from './logging.ts';
import { broadcastToChannel } from './broadcast.ts';

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!
});

const WORLD_GEN_MAX_TOKENS = 4096;
const WORLD_GEN_MAX_ATTEMPTS = 3;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req: Request) => {
  const requestStartedAt = Date.now();
  const requestId = crypto.randomUUID();

  logInfo('generate_world.request_received', {
    requestId,
    method: req.method,
    path: new URL(req.url).pathname
  });

  const webhookSecret = Deno.env.get('GENERATE_WORLD_WEBHOOK_SECRET');
  const authHeader = req.headers.get('authorization');
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    logInfo('generate_world.auth_failed', { requestId });
    return new Response('Unauthorized', { status: 401 });
  }
  logInfo('generate_world.auth_validated', { requestId });

  const payload = await req.json();
  const world = payload.record;

  if (!world?.id || !world?.description) {
    logInfo('generate_world.payload_invalid', {
      requestId,
      hasWorldId: Boolean(world?.id),
      hasDescription: Boolean(world?.description)
    });
    return new Response('Invalid payload', { status: 400 });
  }
  logInfo('generate_world.payload_validated', {
    requestId,
    worldId: world.id,
    descriptionLength: world.description.length
  });

  // Find the campaign linked to this world (needed to initialize campaign files)
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('world_id', world.id)
    .single();

  try {
    await broadcastToChannel(supabaseUrl, serviceRoleKey, world.id, 'world:started', {
      status: 'generating'
    });

    const systemPrompt = `You are a world-builder for tabletop RPG campaigns. Generate a rich WORLD.md document faithful to the genre, tone, and setting described by the player. Do NOT impose a fantasy genre — if the player describes a sci-fi, horror, Western, crime, or any other setting, match it exactly.

Output a Markdown document with exactly these sections (use ## headings):
## World Name
## Overview
## History
## Geography
## Factions
## Tone

Be evocative and specific. Output ONLY the Markdown document, no preamble.`;

    let worldContent = '';
    let missingSections: string[] = [];

    for (let attempt = 1; attempt <= WORLD_GEN_MAX_ATTEMPTS; attempt++) {
      const attemptStartedAt = Date.now();
      const retryInstruction =
        attempt === 1
          ? ''
          : `\n\nYour previous response was incomplete. Regenerate WORLD.md and include all required sections exactly as written. Keep each section concise (2-4 paragraphs or 3-6 bullet points).\nMissing sections: ${missingSections.join(', ')}`;

      logInfo('generate_world.ai_attempt_started', {
        requestId,
        worldId: world.id,
        attempt,
        maxAttempts: WORLD_GEN_MAX_ATTEMPTS,
        retryMissingSections: missingSections
      });

      const aiResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: WORLD_GEN_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: `${world.description}${retryInstruction}` }]
      });

      worldContent = aiResponse.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');

      missingSections = getMissingRequiredSections(worldContent);
      logInfo('generate_world.ai_attempt_finished', {
        requestId,
        worldId: world.id,
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        outputLength: worldContent.length,
        missingSectionsCount: missingSections.length,
        missingSections
      });

      if (missingSections.length > 0 && attempt < WORLD_GEN_MAX_ATTEMPTS) {
        await broadcastToChannel(
          supabaseUrl,
          serviceRoleKey,
          world.id,
          'world:progress',
          {
            attempt,
            maxAttempts: WORLD_GEN_MAX_ATTEMPTS
          }
        );
      }

      if (missingSections.length === 0) break;
    }

    if (missingSections.length > 0) {
      throw new Error(
        `World generation incomplete after retries. Missing sections: ${missingSections.join(', ')}`
      );
    }

    // Save generated content to worlds table
    await supabase
      .from('worlds')
      .update({ world_content: worldContent, status: 'ready' })
      .eq('id', world.id);
    logInfo('generate_world.world_content_saved', { requestId, worldId: world.id });

    // Initialize campaign memory files (4 files — WORLD.md is now on the world record)
    if (campaign?.id) {
      const files = [
        { campaign_id: campaign.id, filename: 'CHARACTERS.md', content: '' },
        { campaign_id: campaign.id, filename: 'NPCS.md', content: '' },
        { campaign_id: campaign.id, filename: 'LOCATIONS.md', content: '' },
        {
          campaign_id: campaign.id,
          filename: 'MEMORY.md',
          content: 'Campaign just started.'
        }
      ];
      for (const file of files) {
        await supabase
          .from('campaign_files')
          .upsert(file, { onConflict: 'campaign_id,filename' });
        logInfo('generate_world.db_file_upserted', {
          requestId,
          campaignId: campaign.id,
          filename: file.filename
        });
      }
    }

    await broadcastToChannel(supabaseUrl, serviceRoleKey, world.id, 'world:complete', {
      status: 'ready'
    });

    // Trigger image generation
    const imageWebhookSecret = Deno.env.get('GENERATE_IMAGE_WEBHOOK_SECRET');
    const imagePromise = fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${imageWebhookSecret}`
      },
      body: JSON.stringify({
        world_id: world.id,
        type: 'cover'
      })
    })
      .then((res) => {
        if (!res.ok) {
          logError(
            'generate_world.image_trigger_failed',
            { requestId, worldId: world.id, status: res.status },
            new Error(`generate-image responded with ${res.status}`)
          );
        } else {
          logInfo('generate_world.image_trigger_succeeded', {
            requestId,
            worldId: world.id
          });
        }
      })
      .catch((err) => {
        logError(
          'generate_world.image_trigger_failed',
          { requestId, worldId: world.id },
          err
        );
      });
    // @ts-ignore — EdgeRuntime is available in Supabase edge function environments
    EdgeRuntime.waitUntil(imagePromise);

    logInfo('generate_world.completed', {
      requestId,
      worldId: world.id,
      durationMs: Date.now() - requestStartedAt
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    logError(
      'generate_world.failed',
      { requestId, worldId: world.id, durationMs: Date.now() - requestStartedAt },
      err
    );

    await supabase.from('worlds').update({ status: 'error' }).eq('id', world.id);

    await broadcastToChannel(supabaseUrl, serviceRoleKey, world.id, 'world:error', {
      status: 'error'
    });

    return new Response('Generation failed', { status: 500 });
  }
});
```

**Step 2: Update `broadcast.ts` channel name** (if it hardcodes `campaign:`)

Check `supabase/functions/generate-world/broadcast.ts`. The `broadcastToChannel` function takes a channel ID argument — verify it doesn't hardcode `campaign:` as a prefix. If it does, update it or make the channel name a parameter. Passing `world.id` as the channel argument will result in the channel name being `world:{world.id}` only if the broadcast helper prepends that prefix. Read the file and fix accordingly.

**Step 3: Commit**

```bash
git add supabase/functions/generate-world/index.ts supabase/functions/generate-world/broadcast.ts
git commit -m "feat: update generate-world edge function to operate on worlds table"
```

---

## Task 5: Update `generate-image` Edge Function

**Files:**

- Modify: `supabase/functions/generate-image/index.ts`

Changes:

- Accept `world_id` instead of `campaign_id`
- Read `worlds.world_content` instead of `campaign_files.WORLD.md`
- Store image at `worlds/{world_id}/cover.png` instead of `{campaign_id}/cover.png`
- Update `worlds.cover_image_url` / `worlds.map_image_url` instead of `campaigns.*`
- Broadcast `world:image_ready` on channel `world:{worldId}` instead of `campaign:{campaignId}`

**Step 1: Update `getStoragePath`**

```typescript
export function getStoragePath(worldId: string, type: string): string {
  return `worlds/${worldId}/${type}.png`;
}
```

**Step 2: Update `broadcastImageReady`**

```typescript
async function broadcastImageReady(
  supabaseUrl: string,
  serviceRoleKey: string,
  worldId: string,
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
            topic: `world:${worldId}`,
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
```

**Step 3: Update `Deno.serve` handler**

Replace the body of `Deno.serve` with:

```typescript
Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get('GENERATE_IMAGE_WEBHOOK_SECRET');
  const authHeader = req.headers.get('authorization');
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { world_id?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { world_id, type = 'cover' } = body;
  if (!world_id) {
    return new Response('Missing world_id', { status: 400 });
  }

  try {
    const { supabaseUrl, serviceRoleKey, supabase } = await createSupabaseClient();

    const { data: worldRow, error: worldError } = await supabase
      .from('worlds')
      .select('world_content')
      .eq('id', world_id)
      .single();

    if (worldError || !worldRow?.world_content) {
      throw new Error(`world_content not found for world ${world_id}`);
    }

    const userPrompt = worldRow.world_content as string;

    const { GoogleGenerativeAI } = await import('npm:@google/generative-ai');
    const genai = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!);
    const model = genai.getGenerativeModel({
      model: 'gemini-3-pro-image-preview',
      systemInstruction: IMAGE_SYSTEM_PROMPT
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        // @ts-ignore
        responseModalities: ['IMAGE']
      }
    });

    const base64Data = extractImageBytes(result.response as GeminiResponse);
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const storagePath = getStoragePath(world_id, type);

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
      .from('worlds')
      .update({ [column]: publicUrl })
      .eq('id', world_id);

    await broadcastImageReady(supabaseUrl, serviceRoleKey, world_id, type, publicUrl);

    return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[generate-image] failed', err);
    return new Response('Image generation failed', { status: 500 });
  }
});
```

**Step 4: Commit**

```bash
git add supabase/functions/generate-image/index.ts
git commit -m "feat: update generate-image edge function to operate on worlds table"
```

---

## Task 6: New `POST /api/world` Route

**Files:**

- Create: `app/api/world/route.ts`

This endpoint creates a world record and fires off world generation. It replaces the world-creation logic that used to be embedded in `POST /api/campaign`.

```typescript
// app/api/world/route.ts
import { NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createAuthServerClient
} from '@/lib/supabase/server';

export async function POST(req: Request) {
  const authClient = await createAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, description } = body;

  if (!name || !description) {
    return NextResponse.json(
      { error: 'Missing required fields: name, description' },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('worlds')
    .insert({
      user_id: user.id,
      name,
      description,
      status: 'generating'
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create world' }, { status: 500 });
  }

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-world`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.GENERATE_WORLD_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.GENERATE_WORLD_WEBHOOK_SECRET}`;
  }

  // Fire-and-forget
  fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      record: { id: data.id, description }
    })
  }).catch((err) => {
    console.error('[generate-world] fire-and-forget fetch failed:', err);
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

**Step 1: Also add `GET /api/world` to list user's worlds**

Add to the same file:

```typescript
export async function GET(_req: Request) {
  const authClient = await createAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('worlds')
    .select('id, name, description, cover_image_url, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch worlds' }, { status: 500 });
  }

  return NextResponse.json({ worlds: data });
}
```

**Step 2: Run TypeScript check**

Run: `yarn tsc --noEmit`

**Step 3: Commit**

```bash
git add app/api/world/route.ts
git commit -m "feat: add POST /api/world and GET /api/world endpoints"
```

---

## Task 7: Update `POST /api/campaign`

**Files:**

- Modify: `app/api/campaign/route.ts`

The campaign creation endpoint now accepts `world_id` instead of `world_description`. It no longer fires `generate-world` — that happens in `POST /api/world`.

```typescript
// app/api/campaign/route.ts
import { NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createAuthServerClient
} from '@/lib/supabase/server';

export async function POST(req: Request) {
  const authClient = await createAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, world_id, system_description } = body;
  const host_username: string =
    body.host_username?.trim() ||
    user.user_metadata?.display_name ||
    user.email ||
    'Unknown Host';

  if (!name || !world_id) {
    return NextResponse.json(
      { error: 'Missing required fields: name, world_id' },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();

  // Verify the world belongs to this user and exists
  const { data: world, error: worldError } = await supabase
    .from('worlds')
    .select('id, status')
    .eq('id', world_id)
    .eq('user_id', user.id)
    .single();

  if (worldError || !world) {
    return NextResponse.json({ error: 'World not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name,
      host_username,
      host_user_id: user.id,
      world_id,
      system_description: system_description || null,
      status: 'lobby'
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

**Step 2: Commit**

```bash
git add app/api/campaign/route.ts
git commit -m "feat: update POST /api/campaign to accept world_id instead of world_description"
```

---

## Task 8: Update `GET /api/campaign/[id]`

**Files:**

- Modify: `app/api/campaign/[id]/route.ts`

The response now includes the world record alongside the campaign.

```typescript
// app/api/campaign/[id]/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const [campaignResult, playersResult, filesResult] = await Promise.all([
    supabase.from('campaigns').select('*, worlds(*)').eq('id', id).single(),
    supabase.from('players').select('*').eq('campaign_id', id),
    supabase.from('campaign_files').select('*').eq('campaign_id', id)
  ]);

  if (campaignResult.error || !campaignResult.data) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // Separate world from campaign for a clean response shape
  const { worlds: world, ...campaign } = campaignResult.data;

  return NextResponse.json({
    campaign,
    world,
    players: playersResult.data ?? [],
    files: filesResult.data ?? []
  });
}
```

**Step 2: Commit**

```bash
git add app/api/campaign/[id]/route.ts
git commit -m "feat: include world data in GET /api/campaign/[id] response"
```

---

## Task 9: Update `POST /api/campaign/[id]/regenerate`

**Files:**

- Modify: `app/api/campaign/[id]/regenerate/route.ts`

Regeneration now retries world generation on the **world** linked to this campaign, not the campaign itself.

```typescript
// app/api/campaign/[id]/regenerate/route.ts
import { NextResponse } from 'next/server';
import {
  createAuthServerClient,
  createServerSupabaseClient
} from '@/lib/supabase/server';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authClient = await createAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, host_user_id, world_id, worlds(id, description)')
    .eq('id', id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  if (campaign.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const world = campaign.worlds as { id: string; description: string };

  const { error: updateError } = await supabase
    .from('worlds')
    .update({ status: 'generating', world_content: null })
    .eq('id', world.id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update world status' }, { status: 500 });
  }

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-world`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.GENERATE_WORLD_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.GENERATE_WORLD_WEBHOOK_SECRET}`;
  }

  fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      record: { id: world.id, description: world.description }
    })
  }).catch((err) => {
    console.error('[generate-world] fire-and-forget fetch failed:', err);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
```

**Step 2: Commit**

```bash
git add app/api/campaign/[id]/regenerate/route.ts
git commit -m "feat: update regenerate endpoint to retry world generation on the worlds table"
```

---

## Task 10: Update `WorldGenForm` Component

**Files:**

- Modify: `components/campaign/WorldGenForm.tsx`

The form now supports two modes:

1. **New world:** User fills in world name + description → creates world → waits → creates campaign
2. **Existing world:** User picks from their worlds list → creates campaign immediately

The flow for "new world":

1. POST `/api/world` → get `world_id`
2. Redirect to `/world/${world_id}/setup?campaign_name=...&system_description=...`
   - The setup page will create the campaign once the world is ready

Actually, this is complex. A simpler approach for the current PR scope:

**Simplified flow (recommended for this PR):**

- User still fills in world description inline (creating a new world)
- POST `/api/world` to create world + trigger generation
- POST `/api/campaign` with the returned `world_id`
- Redirect to `/campaign/${campaignId}/setup` (same as before)

The "pick existing world" UI can be a future enhancement since it requires a world selector component. Add a `// TODO: add world picker` comment.

**Updated `WorldGenForm.tsx`:**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function WorldGenForm() {
  const router = useRouter()
  const [hostUsername, setHostUsername] = useState('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const displayName = data.user?.user_metadata?.display_name
      if (displayName) setHostUsername(displayName)
    })
  }, [])

  const [name, setName] = useState('')
  const [worldDescription, setWorldDescription] = useState('')
  const [systemDescription, setSystemDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsGenerating(true)

    try {
      // Step 1: Create the world
      const worldRes = await fetch('/api/world', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: worldDescription,
        }),
      })

      const worldData = await worldRes.json()

      if (!worldRes.ok) {
        setError(worldData.error ?? 'Failed to create world.')
        setIsGenerating(false)
        return
      }

      // Step 2: Create the campaign linked to this world
      const campaignRes = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          host_username: hostUsername || undefined,
          world_id: worldData.id,
          system_description: systemDescription || undefined,
        }),
      })

      const campaignData = await campaignRes.json()

      if (!campaignRes.ok) {
        setError(campaignData.error ?? 'Something went wrong. Check the gauges.')
        setIsGenerating(false)
        return
      }

      router.push(`/campaign/${campaignData.id}/setup`)
      // keep isGenerating=true so the loader stays until the page unmounts
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'World generation failed in the background. Please try forging again.'
      setError(message)
      setIsGenerating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Display Name */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="host_username"
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Your Name{' '}
          <span className="text-ash/80 normal-case tracking-normal" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
            (optional — defaults to your email)
          </span>
        </Label>
        <Input
          id="host_username"
          type="text"
          value={hostUsername}
          onChange={e => setHostUsername(e.target.value)}
          placeholder="DungeonMaster42"
          className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Campaign Name */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="name"
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Campaign Name
        </Label>
        <Input
          id="name"
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="The Lost Mines of Karathos"
          className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Describe Your World */}
      {/* TODO: add world picker — allow selecting an existing world instead of creating new */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="world_description"
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Describe Your World
        </Label>
        <Textarea
          id="world_description"
          required
          value={worldDescription}
          onChange={e => setWorldDescription(e.target.value)}
          placeholder="A dark medieval kingdom where dragons have returned after a thousand years..."
          rows={4}
          className="resize-none border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Custom Rules (optional) */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="system_description"
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Custom Rules{' '}
          <span className="text-ash/80 normal-case tracking-normal" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
            (optional)
          </span>
        </Label>
        <Textarea
          id="system_description"
          value={systemDescription}
          onChange={e => setSystemDescription(e.target.value)}
          placeholder="Leave blank to use standard d20 rules"
          rows={3}
          className="resize-none border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        type="submit"
        disabled={isGenerating}
        className="relative overflow-hidden bg-brass text-soot font-bold uppercase tracking-[0.15em] hover:bg-furnace transition-colors duration-300 disabled:opacity-60"
        style={{
          clipPath: 'polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)',
        }}
      >
        {isGenerating ? 'Forging...' : 'Forge Campaign'}
      </Button>
    </form>
  )
}
```

**Step 2: Commit**

```bash
git add components/campaign/WorldGenForm.tsx
git commit -m "feat: update WorldGenForm to create world then campaign in two steps"
```

---

## Task 11: Update Campaign Setup Page

**Files:**

- Modify: `app/campaign/[id]/setup/page.tsx`

The setup page needs to:

1. Load the campaign + world via `GET /api/campaign/[id]` (which now returns `{ campaign, world, ... }`)
2. Subscribe to `world:{world.id}` Realtime channel (not `campaign:{campaignId}`)
3. Read `world.cover_image_url` and `world.status` instead of `campaign.cover_image_url` and `campaign.status`
4. Keep the existing visual design intact — only change data sources

Key changes:

- `CampaignPayload` type updated to include `world: World`
- Realtime channel: `world:${world.id}`
- `busy` based on `world.status === 'generating'`
- `isComplete` based on `world.status === 'ready'`
- Cover image from `world.cover_image_url`
- Error state from `world.status === 'error'`
- The `SETUP_ELIGIBLE_STATUSES` check moves to world status

**Step 1: Update the type and `loadCampaign`**

```typescript
import type { Campaign, World } from '@/types';

type CampaignPayload = {
  campaign: Campaign;
  world: World;
};
```

**Step 2: Update the Realtime subscription** — change `.channel('campaign:${campaignId}')` to `.channel('world:${worldId}')` where `worldId` is `world.id` loaded from the initial fetch.

The tricky part: on initial load we don't know `world_id` until the fetch completes. Subscribe to the channel after the initial load, or subscribe using `world_id` from the campaign record which is known after the first fetch. The `campaign.world_id` field is available immediately after `loadCampaign` resolves.

Use a `worldId` state variable initialized from the campaign fetch:

```typescript
const [worldId, setWorldId] = useState<string | null>(null);

const loadCampaign = useCallback(async (): Promise<CampaignPayload> => {
  const res = await fetch(`/api/campaign/${campaignId}`);
  if (!res.ok) throw new Error('Campaign not found.');
  const data = (await res.json()) as CampaignPayload;
  setCampaign(data.campaign);
  setWorldId(data.campaign.world_id);
  if (data.world.cover_image_url) {
    setCoverImageUrl(`${data.world.cover_image_url}?t=${Date.now()}`);
  }
  setStatusText(statusMessage(data.world.status));
  return data;
}, [campaignId]);
```

Then in `useEffect`, subscribe to the channel only after `worldId` is set. The simplest approach: load campaign first (synchronously in the effect), then set up the subscription using the returned world ID.

```typescript
useEffect(() => {
  let mounted = true;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  (async () => {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(
          `/login?redirect=${encodeURIComponent(`/campaign/${campaignId}/setup`)}`
        );
        return;
      }

      const data = await loadCampaign();
      if (!mounted) return;

      if (data.campaign.host_user_id !== user.id) {
        router.replace('/');
        return;
      }

      if (!['generating', 'ready', 'error'].includes(data.world.status)) {
        router.replace('/');
        return;
      }

      setBusy(data.world.status === 'generating');
      if (data.world.status === 'error') {
        setError('World generation failed. You can retry from this setup page.');
      }
      setPageLoading(false);

      // Subscribe to the world channel now that we know the world ID
      channel = supabase
        .channel(`world:${data.campaign.world_id}`)
        .on('broadcast', { event: 'world:started' }, () => {
          if (!mounted) return;
          setError(null);
          setBusy(true);
          setStatusText('World forge is active. This page updates automatically...');
        })
        .on('broadcast', { event: 'world:complete' }, async () => {
          if (!mounted) return;
          try {
            const refreshed = await loadCampaign();
            if (!mounted) return;
            setBusy(false);
            setError(null);
            setStatusText(statusMessage(refreshed.world.status));
          } catch (err) {
            if (!mounted) return;
            setError(err instanceof Error ? err.message : 'Failed to load world data.');
            setBusy(false);
          }
        })
        .on('broadcast', { event: 'world:error' }, () => {
          if (!mounted) return;
          setBusy(false);
          setError('World generation failed. You can retry from this setup page.');
          setStatusText(statusMessage('error'));
        })
        .on(
          'broadcast',
          { event: 'world:image_ready' },
          (message: { payload: { type: string; url: string } }) => {
            if (!mounted) return;
            if (message.payload.type === 'cover') {
              setImageLoaded(false);
              setCoverImageUrl(message.payload.url);
            }
          }
        )
        .subscribe();
    } catch (err) {
      if (!mounted) return;
      setError(err instanceof Error ? err.message : 'Failed to load campaign setup.');
      setBusy(false);
      setPageLoading(false);
    }
  })();

  return () => {
    mounted = false;
    if (channel) void supabase.removeChannel(channel);
  };
}, [campaignId, loadCampaign, router, supabase]);
```

Update `statusMessage` to accept `WorldStatus`:

```typescript
function statusMessage(status: WorldStatus | string): string {
  switch (status) {
    case 'generating':
      return 'World forge is active in the background. This page updates automatically.';
    case 'ready':
      return 'World generation complete.';
    case 'error':
      return 'World generation failed.';
    default:
      return `World status: ${status}.`;
  }
}
```

Update `isComplete`:

```typescript
// Replace: const isComplete = campaign?.status === 'lobby'
// With a world state variable:
const [world, setWorld] = useState<World | null>(null);
// Set in loadCampaign: setWorld(data.world)
const isComplete = world?.status === 'ready';
```

**Step 3: Commit**

```bash
git add app/campaign/[id]/setup/page.tsx
git commit -m "feat: update campaign setup page to subscribe to world channel and read world status"
```

---

## Task 12: Update `generate-world` broadcast channel name

**Files:**

- Check: `supabase/functions/generate-world/broadcast.ts`

Read the file. The `broadcastToChannel` function signature is `broadcastToChannel(supabaseUrl, serviceRoleKey, channelId, event, payload)`. Check how `channelId` is used — it may build the topic as `campaign:${channelId}` or just `${channelId}`.

If it hardcodes `campaign:` prefix, update it to use a generic prefix or remove the prefix and let callers pass the full channel name. The calls in `index.ts` (Task 4) already pass `world.id` as the channel ID — the broadcast.ts file needs to build topic as the ID directly, or callers must pass the full `world:{id}` string.

**Recommended fix:** Make `broadcastToChannel` accept the full channel name (no prefix logic inside):

```typescript
// If current signature builds: topic = `campaign:${channelId}`
// Change to: topic = channelId  (or topic = `world:${channelId}` if that's the convention)
```

Callers in `index.ts` should then pass `world:${world.id}` as the channel argument, or the function internally prefixes with `world:`. Consistency matters — pick one approach.

**Step 1: Read broadcast.ts, identify the topic construction**

**Step 2: Update so callers pass `world:${world.id}` and the broadcast function uses the value as-is**

**Step 3: Commit**

```bash
git add supabase/functions/generate-world/broadcast.ts
git commit -m "fix: update broadcast channel to support world: prefix"
```

---

## Task 13: Final TypeScript Check + Manual Test

**Step 1: Full TypeScript check**

Run: `yarn tsc --noEmit`

Expected: Zero errors.

**Step 2: Manual test — new world + campaign creation**

1. Go to `/campaign/new`
2. Fill in campaign name, world description, optional rules
3. Submit → observe two API calls in Network tab: POST `/api/world` then POST `/api/campaign`
4. Redirect to `/campaign/[id]/setup`
5. Page subscribes to `world:{worldId}` channel
6. After generation completes: status shows "Complete", cover image appears
7. Click "Enter Lobby" → proceeds normally

**Step 3: Manual test — regenerate on error**

1. With a campaign that has a world in `error` status, visit `/campaign/[id]/setup`
2. Click "Retry Generation"
3. Confirm world status updates to `generating`, then eventually `ready`

**Step 4: Verify database state in Supabase Dashboard**

```sql
-- Confirm structure
SELECT c.id, c.name, c.world_id, w.status, w.world_content IS NOT NULL as has_content
FROM campaigns c
JOIN worlds w ON w.id = c.world_id
LIMIT 10;

-- Confirm no WORLD.md in campaign_files
SELECT DISTINCT filename FROM campaign_files ORDER BY filename;
-- Expected: CHARACTERS.md, LOCATIONS.md, MEMORY.md, NPCS.md (no WORLD.md)
```

**Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```

---

## Task 14: Deploy Edge Functions

**Step 1: Deploy both updated edge functions**

```bash
npx supabase functions deploy generate-world
npx supabase functions deploy generate-image
```

**Step 2: Verify in Supabase Dashboard → Edge Functions**

Check that both functions deployed successfully and show the new version.

**Step 3: Commit**

```bash
git commit -m "chore: deploy updated generate-world and generate-image edge functions"
```

---

## Summary of All Changed Files

| File                                             | Change                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `supabase/migrations/005_worlds_table.sql`       | **NEW** — worlds table, FK on campaigns, data migration                    |
| `types/world.ts`                                 | **NEW** — World, WorldInsert, WorldStatus types                            |
| `types/campaign.ts`                              | Remove world fields, add world_id, remove 'generating'/'error' from status |
| `types/index.ts`                                 | Export World types                                                         |
| `lib/memory.ts`                                  | Remove WORLD.md from initializeCampaignFiles                               |
| `supabase/functions/generate-world/index.ts`     | Operate on world record, broadcast on world channel                        |
| `supabase/functions/generate-world/broadcast.ts` | Support world: channel prefix                                              |
| `supabase/functions/generate-image/index.ts`     | Accept world_id, read worlds table, store at worlds/ path                  |
| `app/api/world/route.ts`                         | **NEW** — POST/GET /api/world                                              |
| `app/api/campaign/route.ts`                      | Accept world_id, remove world_description                                  |
| `app/api/campaign/[id]/route.ts`                 | Return world in response                                                   |
| `app/api/campaign/[id]/regenerate/route.ts`      | Retry on worlds table                                                      |
| `components/campaign/WorldGenForm.tsx`           | Two-step creation: world then campaign                                     |
| `app/campaign/[id]/setup/page.tsx`               | Subscribe to world channel, read world status/images                       |
