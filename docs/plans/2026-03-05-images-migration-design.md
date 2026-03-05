# Images Migration Design

**Goal:** Remove `_url` columns from all parent tables. Make `images` the single source of truth. Unify realtime image events onto a single channel and event.

---

## Architecture

Single source of truth: `images` table. No `_url` columns. No denormalization. One channel per world (`world:{world_id}`), one event (`image:ready`), clients filter by `entity_id`.

---

## DB Migration (012)

Drop columns:
- `worlds.cover_image_url`, `worlds.map_image_url`
- `sessions.scene_image_url`
- `players.character_image_url`
- `messages.image_url`

---

## Edge Function: `generate-image`

Two changes:

1. **Remove `denormalizeUrl`** — delete the function and its call
2. **Unify broadcast** — replace the two `broadcastToChannel` calls with one:
   - Channel: `world:{world_id}` (needs `world_id` threaded through for sessions — already available from `buildPrompt`)
   - Event: `image:ready`
   - Payload: `{ entity_type, entity_id, image_type, url: publicUrl, image_id: imageId }`

`buildPrompt` already returns `campaignId` for sessions — extend it to also return `worldId`.

---

## Frontend: Initial Load

Two places read `_url` columns on initial load:

**`game/page.tsx`** (server component): currently selects `session.scene_image_url`, `world.map_image_url`, `world.cover_image_url`. Replace with a single `images` query:
```sql
SELECT entity_type, entity_id, image_type, public_url
FROM images
WHERE status = 'ready'
  AND entity_type IN ('world', 'session')
  AND entity_id IN (<world_id>, <session_id>)
```
Map results to `{ worldCoverUrl, worldMapUrl, sessionSceneUrl }` and pass as props.

**`setup/page.tsx`**: currently reads `data.world.cover_image_url` on load. Replace with same `images` query for `entity_type='world' AND entity_id=<world_id>`.

**`api/world/route.ts`**: drop `cover_image_url` from select. If callers need it, join from `images` or omit from response.

---

## Frontend: Realtime

**`setup/page.tsx`**: already subscribes to `world:{world_id}`. Change event from `world:image_ready` to `image:ready`. Filter `entity_id === world.id`. Update cover/map state from `payload.url` and `payload.image_type`.

**`GameClient.tsx`**:
- Drop `postgres_changes` subscription on `sessions` that watched `scene_image_url`
- Listen for `image:ready` on `world:{world_id}` channel
- Handler:
  - `entity_type === 'world' && entity_id === world.id` → update world cover/map
  - `entity_type === 'session' && entity_id === session.id` → update live scene cover
  - `entity_type === 'player'` → update character portrait in party sidebar (new — no live update existed before)

---

## Broadcast Payload Shape

```ts
type ImageReadyPayload = {
  entity_type: 'world' | 'session' | 'player'
  entity_id: string
  image_type: 'cover' | 'map' | 'scene' | 'character'
  url: string
  image_id: string
}
```

Event name: `image:ready`
Channel: `world:{world_id}`

---

## Error Handling

If `images` query returns no rows on initial load, render without image — same as today's `null` fallback.

---

## Testing

- Unit: `buildPrompt` returns `worldId` for session entity type
- Unit: `broadcastImageReady` emits correct channel (`world:{world_id}`) and payload shape for both world and session entity types
- Visual/manual: setup page shows cover image after world generation; game room shows scene cover; party sidebar shows character portrait live
