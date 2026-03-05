# Images Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all `_url` columns from parent tables, make `images` the single source of truth, and unify image realtime events onto a single `image:ready` broadcast on `world:{world_id}`.

**Architecture:** DB migration drops `_url` columns. Edge function removes denormalization and broadcasts a single `image:ready` event on `world:{world_id}` with the full image payload. Frontend queries `images` on initial load; realtime listens for `image:ready` and filters by `entity_id` client-side.

**Tech Stack:** Supabase migrations (SQL), Deno edge functions (TypeScript), Next.js 14 App Router, Supabase Realtime broadcast, Vitest.

---

## Task 1: Migration 012 — Drop `_url` columns

**Files:**
- Create: `supabase/migrations/012_drop_url_columns.sql`

**Step 1: Create the migration file**

```sql
-- supabase/migrations/012_drop_url_columns.sql

ALTER TABLE worlds
  DROP COLUMN cover_image_url,
  DROP COLUMN map_image_url;

ALTER TABLE sessions
  DROP COLUMN scene_image_url;

ALTER TABLE players
  DROP COLUMN character_image_url;

ALTER TABLE messages
  DROP COLUMN image_url;
```

**Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `012_drop_url_columns` and the SQL above.

**Step 3: Verify columns are gone**

Use `mcp__supabase__execute_sql`:
```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name IN ('worlds', 'sessions', 'players', 'messages')
  AND column_name IN ('cover_image_url', 'map_image_url', 'scene_image_url', 'character_image_url', 'image_url')
ORDER BY table_name;
```
Expected: zero rows.

**Step 4: Commit**

```bash
git add supabase/migrations/012_drop_url_columns.sql
git commit -m "feat: drop _url columns — images table is now the single source of truth"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `types/world.ts`
- Modify: `types/session.ts`
- Modify: `types/player.ts`
- Modify: `types/message.ts`

**Step 1: Update `types/world.ts`**

Remove `cover_image_url` and `map_image_url` from the `World` type. Result:

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
  status: WorldStatus;
  classes: WorldClass[];
  created_at: string;
};

export type WorldInsert = Pick<World, 'user_id' | 'name' | 'description'>;
```

**Step 2: Update `types/session.ts`**

Remove `scene_image_url`. Result:

```typescript
export type Session = {
  id: string
  campaign_id: string
  session_number: number
  present_player_ids: string[]
  summary_md: string | null
  opening_situation: string | null
  starting_hooks: string[] | null
  started_at: string
  ended_at: string | null
}

export type SessionInsert = Pick<
  Session,
  'campaign_id' | 'session_number'
> & {
  present_player_ids?: string[]
}
```

**Step 3: Update `types/player.ts`**

Remove `character_image_url`. Result:

```typescript
export type Player = {
  id: string
  campaign_id: string
  user_id: string
  username: string
  character_name: string | null
  character_class: string | null
  character_backstory: string | null
  stats: { hp: number; hp_max: number }
  status: 'active' | 'dead' | 'incapacitated' | 'absent'
  absence_mode: 'skip' | 'npc' | 'auto_act'
  is_host: boolean
  is_ready: boolean
  last_seen_at: string
  joined_at: string
}

export type PlayerInsert = Pick<
  Player,
  'campaign_id' | 'user_id' | 'username'
> & {
  character_name?: string
  character_class?: string
  character_backstory?: string
  is_host?: boolean
}
```

**Step 4: Update `types/message.ts`**

Remove `image_url` from both `Message` and `MessageInsert`. Result:

```typescript
export type Message = {
  id: string
  campaign_id: string
  session_id: string | null
  player_id: string | null
  content: string
  type: 'action' | 'narration' | 'system' | 'ooc'
  created_at: string
}

export type MessageInsert = Pick<Message, 'campaign_id' | 'content' | 'type'> & {
  session_id?: string
  player_id?: string
}
```

**Step 5: Check TypeScript compiles**

```bash
yarn tsc --noEmit
```
Expected: errors only from files that reference the removed fields — those are the files we'll fix in subsequent tasks.

**Step 6: Commit**

```bash
git add types/world.ts types/session.ts types/player.ts types/message.ts
git commit -m "feat: remove _url fields from TypeScript types"
```

---

## Task 3: Update `generate-image` edge function

**Files:**
- Modify: `supabase/functions/generate-image/index.ts`

Three changes: (1) `buildPrompt` returns `worldId`, (2) remove `denormalizeUrl`, (3) rewrite `broadcastImageReady` as a single unified broadcast.

**Step 1: Update `buildPrompt` return type and body**

Change the return type from `Promise<{ systemPrompt: string; userPrompt: string; campaignId?: string }>` to `Promise<{ systemPrompt: string; userPrompt: string; worldId: string }>`.

For `entityType === "world"`, add `worldId: entityId` to the return.
For `entityType === "session"`, return `worldId: campaign.world_id` (already fetched in the query).

Replace lines 64–122 with:

```typescript
async function buildPrompt(
  supabase: ReturnType<typeof createClient>,
  entityType: string,
  entityId: string,
  imageType: string,
): Promise<{ systemPrompt: string; userPrompt: string; worldId: string }> {
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
      worldId: entityId,
    }
  }

  if (entityType === "session") {
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("campaign_id")
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
      worldId: campaign.world_id,
    }
  }

  throw new Error(`Unsupported entity_type: ${entityType}`)
}
```

**Step 2: Remove `denormalizeUrl` function**

Delete lines 124–145 (the entire `denormalizeUrl` function).

**Step 3: Rewrite `broadcastImageReady`**

Replace lines 147–174 with:

```typescript
export async function broadcastImageReady(
  supabaseUrl: string,
  serviceRoleKey: string,
  worldId: string,
  entityType: string,
  entityId: string,
  imageType: string,
  publicUrl: string,
  imageId: string,
): Promise<void> {
  await broadcastToChannel(supabaseUrl, serviceRoleKey, `world:${worldId}`, "image:ready", {
    entity_type: entityType,
    entity_id: entityId,
    image_type: imageType,
    url: publicUrl,
    image_id: imageId,
  })
}
```

**Step 4: Update `Deno.serve` handler**

In the try block of the handler, update step 6 and 7:
- Remove the call to `denormalizeUrl`
- Update `broadcastImageReady` call to pass `worldId` instead of `campaignId`

Replace the relevant lines:

```typescript
    // 2. Build prompt
    const { systemPrompt, userPrompt, worldId } = await buildPrompt(supabase, entity_type, entity_id, image_type)

    // ... (Gemini call and upload unchanged) ...

    // 5. Update images row
    await supabase
      .from("images")
      .update({ status: "ready", storage_path: storagePath, public_url: publicUrl })
      .eq("id", imageId)

    // 6. Broadcast
    await broadcastImageReady(supabaseUrl, serviceRoleKey, worldId, entity_type, entity_id, image_type, publicUrl, imageId)
```

(Steps 1–4 in the try block — images row insert, Gemini, upload — are unchanged.)

**Step 5: Commit**

```bash
git add supabase/functions/generate-image/index.ts
git commit -m "feat: remove denormalization and unify image broadcast on world channel"
```

---

## Task 4: Update `generate-image` tests

**Files:**
- Modify: `supabase/functions/generate-image/__tests__/index.test.ts`

**Step 1: Add tests for `broadcastImageReady`**

The function is now exported. Add a `describe('broadcastImageReady', ...)` block that mocks `broadcastToChannel` and asserts the channel name and payload shape.

Replace the full test file with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('Deno', {
  env: { get: () => 'test-value' },
  serve: vi.fn()
});

// Mock the broadcast helper before importing index
vi.mock('../generate-world/broadcast.ts', () => ({
  broadcastToChannel: vi.fn().mockResolvedValue(undefined),
}));

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

describe('broadcastImageReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('broadcasts to world:{worldId} with image:ready event for a world image', async () => {
    const { broadcastImageReady } = await import('../index.ts');
    const { broadcastToChannel } = await import('../generate-world/broadcast.ts');

    await broadcastImageReady(
      'https://example.supabase.co',
      'service-key',
      'world-abc',
      'world',
      'world-abc',
      'cover',
      'https://cdn.example.com/cover.png',
      'image-uuid',
    );

    expect(broadcastToChannel).toHaveBeenCalledOnce();
    expect(broadcastToChannel).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-key',
      'world:world-abc',
      'image:ready',
      {
        entity_type: 'world',
        entity_id: 'world-abc',
        image_type: 'cover',
        url: 'https://cdn.example.com/cover.png',
        image_id: 'image-uuid',
      }
    );
  });

  it('broadcasts to world:{worldId} with image:ready event for a session image', async () => {
    const { broadcastImageReady } = await import('../index.ts');
    const { broadcastToChannel } = await import('../generate-world/broadcast.ts');

    await broadcastImageReady(
      'https://example.supabase.co',
      'service-key',
      'world-xyz',       // worldId (different from entityId for sessions)
      'session',
      'session-789',
      'scene',
      'https://cdn.example.com/scene.png',
      'image-uuid-2',
    );

    expect(broadcastToChannel).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-key',
      'world:world-xyz',  // channel uses worldId, not session/campaign id
      'image:ready',
      {
        entity_type: 'session',
        entity_id: 'session-789',
        image_type: 'scene',
        url: 'https://cdn.example.com/scene.png',
        image_id: 'image-uuid-2',
      }
    );
  });
});
```

**Step 2: Run tests**

```bash
yarn test supabase/functions/generate-image/__tests__/index.test.ts
```
Expected: all 8 tests pass.

**Step 3: Commit**

```bash
git add supabase/functions/generate-image/__tests__/index.test.ts
git commit -m "test: add broadcastImageReady tests for unified world channel"
```

---

## Task 5: Update `api/world/route.ts` GET

**Files:**
- Modify: `app/api/world/route.ts`

**Step 1: Remove `cover_image_url` from worlds select**

On line 78, change:
```typescript
.select('id, name, description, cover_image_url, status, created_at')
```
to:
```typescript
.select('id, name, description, status, created_at')
```

**Step 2: Commit**

```bash
git add app/api/world/route.ts
git commit -m "feat: remove cover_image_url from worlds API response"
```

---

## Task 6: Update `game/page.tsx` — query images for initial load

**Files:**
- Modify: `app/campaign/[slug]/game/page.tsx`

**Step 1: Update the session query**

Line 68 currently selects `opening_situation, scene_image_url`. Remove `scene_image_url`:

```typescript
const { data: session } = await db
  .from('sessions')
  .select('opening_situation')
  .eq('campaign_id', campaign.id)
  .eq('session_number', 1)
  .maybeSingle()
```

**Step 2: Add images query**

After the session query (after line 71), add:

```typescript
// Fetch images for initial render (world cover/map, session scene, player portraits)
const playerIds = (players ?? []).map((p) => p.id)
const imageEntityIds = [world.id, ...(session ? [session.id] : []), ...playerIds]

const { data: imageRows } = await db
  .from('images')
  .select('entity_type, entity_id, image_type, public_url')
  .eq('status', 'ready')
  .in('entity_id', imageEntityIds)

const findImage = (entityId: string, imageType: string) =>
  imageRows?.find((i) => i.entity_id === entityId && i.image_type === imageType)?.public_url ?? null

const worldCoverUrl = findImage(world.id, 'cover')
const worldMapUrl = findImage(world.id, 'map')
const sessionSceneUrl = session ? findImage(session.id, 'scene') : null

const initialPlayerImages: Record<string, string> = {}
for (const p of players ?? []) {
  const url = findImage(p.id, 'character')
  if (url) initialPlayerImages[p.id] = url
}
```

**Step 3: Update the derived values and JSX**

Replace lines 73–92 (the `openingReady`, `loadingImageUrl` block and the return) with:

```typescript
const openingReady = !!session?.opening_situation

// Loading background: session scene → world map → world cover
const loadingImageUrl = sessionSceneUrl ?? worldMapUrl ?? worldCoverUrl ?? undefined

return (
  <GameClient
    campaign={campaign}
    world={world}
    players={players ?? []}
    messages={messages ?? []}
    currentUserId={user.id}
    openingReady={openingReady}
    loadingImageUrl={loadingImageUrl}
    sessionCoverImageUrl={sessionSceneUrl ?? undefined}
    initialPlayerImages={initialPlayerImages}
  />
)
```

**Step 4: Run TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | grep "game/page"
```
Expected: no errors from this file.

**Step 5: Commit**

```bash
git add app/campaign/[slug]/game/page.tsx
git commit -m "feat: query images table for initial load in game page"
```

---

## Task 7: Update `GameClient.tsx`

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx`

This is the largest change. Four sub-tasks:
1. Add `initialPlayerImages` prop, new `playerImages` state
2. Remove `character_image_url` from mock data
3. Replace `postgres_changes` on sessions with `image:ready` broadcast
4. Remove `world.cover_image_url` references throughout

**Step 1: Find the `GameRoomView` props interface and add `initialPlayerImages`**

Search for the `GameRoomView` function definition (around line 1430–1445). Add `initialPlayerImages` to its props:

```typescript
  initialPlayerImages: Record<string, string>;
```

Also rename `sessionCoverImageUrl` prop to `initialSessionCoverImageUrl` for clarity (it already is named that inside — confirm at line 1442).

**Step 2: Add `playerImages` state**

After the existing `useState` calls inside `GameRoomView` (around line 1449), add:

```typescript
const [playerImages, setPlayerImages] = useState<Record<string, string>>(initialPlayerImages);
```

**Step 3: Replace the realtime subscription**

Replace the entire `useEffect` block at lines 1452–1488 with:

```typescript
  // Subscribe to messages and image updates
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game-active:${campaign.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `campaign_id=eq.${campaign.id}` },
        (payload) => {
          setLiveMessages((prev) => {
            if (prev.some((m) => m.id === (payload.new as Message).id)) return prev;
            return [...prev, payload.new as Message];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `campaign_id=eq.${campaign.id}` },
        (payload) => {
          setLiveMessages((prev) =>
            prev.map((m) => (m.id === (payload.new as Message).id ? (payload.new as Message) : m))
          );
        }
      )
      .on('broadcast', { event: 'image:ready' }, (message: {
        payload: {
          entity_type: string
          entity_id: string
          image_type: string
          url: string
          image_id: string
        }
      }) => {
        const { entity_type, entity_id, url } = message.payload;
        if (entity_type === 'session' && entity_id === session.id) {
          setLiveCoverUrl(url);
        } else if (entity_type === 'world' && entity_id === world.id) {
          setLiveCoverUrl(url);
        } else if (entity_type === 'player') {
          setPlayerImages((prev) => ({ ...prev, [entity_id]: url }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaign.id, session.id, world.id]);
```

Note: this requires `session` and `world` to be in scope. Check the `GameRoomView` props — `world` is already a prop. `session` is not currently a prop. See step below.

**Step 3a: Add `session` prop to `GameRoomView`**

Check if `session` is already a prop of `GameRoomView`. If not, add:
- To the props interface: `session: { id: string }`
- Thread it through from the parent: the parent `GameClient` component receives `campaign` and creates session references. Look for where `GameRoomView` is rendered (around line 1650+) and pass `session={{ id: sessionId }}`.

Actually: look at what `GameRoomView` currently receives. If `sessionCoverImageUrl` comes from `page.tsx` as a prop of `GameClient`, then `GameClient` has a `session` id somewhere. Trace the data flow:

In `game/page.tsx`, `session.id` is available. It currently passes `sessionCoverImageUrl` — add `sessionId` as a separate prop to `GameClient` and thread it to `GameRoomView`.

Add to `GameClient` props interface:
```typescript
sessionId: string | null
```

Add to `GameRoomView` props:
```typescript
sessionId: string | null
```

In `game/page.tsx`, pass:
```typescript
sessionId={session?.id ?? null}
```

In the `image:ready` handler, guard the session check:
```typescript
if (entity_type === 'session' && sessionId && entity_id === sessionId) {
```

**Step 4: Remove `character_image_url` from mock data**

In the `MOCK_PLAYERS` array (around lines 112, 129, 146), remove the `character_image_url: null` lines from each mock player object.

**Step 5: Replace `player.character_image_url` render**

Find the render at line ~855:
```typescript
{player.character_image_url ? (
  <img src={player.character_image_url} ...
```

Replace with:
```typescript
{playerImages[player.id] ? (
  <img src={playerImages[player.id]} ...
```

**Step 6: Remove `world.cover_image_url` references**

Search for all occurrences of `world.cover_image_url` (lines 1654, 1691, 1698, 1701, 1705). Replace each with just `liveCoverUrl`. The `liveCoverUrl` state is already seeded from `initialSessionCoverImageUrl` (which comes from `sessionSceneUrl ?? worldCoverUrl` in `page.tsx`), so initial load works correctly.

Example replacements (adjust exact lines as found):
- `liveCoverUrl ?? world.cover_image_url ?? null` → `liveCoverUrl ?? null`
- `liveCoverUrl ?? world.cover_image_url` → `liveCoverUrl`
- `(liveCoverUrl ?? world.cover_image_url) ? 'pointer' : 'default'` → `liveCoverUrl ? 'pointer' : 'default'`
- `src={liveCoverUrl ?? world.cover_image_url!}` → `src={liveCoverUrl!}`

**Step 7: Run TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | grep "GameClient"
```
Expected: no errors.

**Step 8: Commit**

```bash
git add app/campaign/[slug]/game/GameClient.tsx app/campaign/[slug]/game/page.tsx
git commit -m "feat: GameClient listens to image:ready broadcast, reads from images table"
```

---

## Task 8: Update `setup/page.tsx`

**Files:**
- Modify: `app/campaign/[slug]/setup/page.tsx`

**Step 1: Query images on initial load**

In `loadCampaign` (around line 44), after fetching the campaign/world data and before the return, add a Supabase query for the world's cover image:

```typescript
const { data: imageRows } = await supabase
  .from('images')
  .select('image_type, public_url')
  .eq('entity_type', 'world')
  .eq('entity_id', data.campaign.world_id)
  .eq('status', 'ready')

const coverRow = imageRows?.find((i) => i.image_type === 'cover')
if (coverRow?.public_url) {
  setCoverImageUrl(`${coverRow.public_url}?t=${Date.now()}`)
}
```

Remove the old lines (53–55):
```typescript
if (data.world.cover_image_url) {
  setCoverImageUrl(`${data.world.cover_image_url}?t=${Date.now()}`)
}
```

**Step 2: Update the `world:image_ready` listener to `image:ready`**

Replace lines 124–134:
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

With:
```typescript
          .on(
            'broadcast',
            { event: 'image:ready' },
            (message: {
              payload: {
                entity_type: string
                entity_id: string
                image_type: string
                url: string
                image_id: string
              }
            }) => {
              if (!mounted) return
              const { entity_type, entity_id, image_type, url } = message.payload
              if (entity_type === 'world' && entity_id === data.campaign.world_id && image_type === 'cover') {
                setImageLoaded(false)
                setCoverImageUrl(url)
              }
            }
          )
```

**Step 3: Run TypeScript check**

```bash
yarn tsc --noEmit 2>&1 | grep "setup/page"
```
Expected: no errors.

**Step 4: Full TypeScript check**

```bash
yarn tsc --noEmit
```
Expected: zero errors.

**Step 5: Commit**

```bash
git add app/campaign/[slug]/setup/page.tsx
git commit -m "feat: setup page reads images table and listens to image:ready broadcast"
```

---

## Task 9: Deploy updated edge function

**Step 1: Deploy**

Use `mcp__supabase__deploy_edge_function` with function name `generate-image` and the contents of `supabase/functions/generate-image/index.ts`.

**Step 2: Verify**

Use `mcp__supabase__list_edge_functions` and confirm `generate-image` is listed with a recent updated_at timestamp.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: deploy unified generate-image edge function"
```
