# Images Table Design

**Date:** 2026-03-05

## Goals

1. Central registry of all images in the app with generation status tracking
2. Multi-image support per entity (future-proof)
3. Single unified edge function to generate any image type
4. Progressive migration — keep existing `_url` columns as a denormalized cache for now, drop later

## Schema

```sql
CREATE TABLE images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,  -- 'world' | 'session' | 'player' | 'message'
  entity_id     UUID NOT NULL,
  image_type    TEXT NOT NULL,  -- 'cover' | 'map' | 'scene' | 'character' | 'inline'
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'generating' | 'ready' | 'failed'
  storage_path  TEXT,
  public_url    TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_images_entity ON images(entity_type, entity_id);
CREATE INDEX idx_images_status ON images(status);
```

`updated_at` trigger reuses `set_updated_at()` from migration 001.

### Design decisions

- **Polymorphic** (`entity_type` + `entity_id`) — no FK enforcement, handled at app layer. Chosen over separate join tables (too many) and nullable FK columns (too awkward).
- **No enum columns** — TEXT for `entity_type`, `image_type`, `status` to allow adding values without schema changes.
- `_url` columns on parent tables are kept as a denormalized read cache. A future migration will drop them once all reads go through `images`.

## Migration Plan

| # | Description |
|---|---|
| 010 | Create `images` table + `updated_at` trigger |
| 011 | Backfill existing images from all parent tables |

### Backfill sources (011)

- `worlds.cover_image_url` → `(entity_type='world', image_type='cover', status='ready')`
- `worlds.map_image_url` → `(entity_type='world', image_type='map', status='ready')`
- `sessions.scene_image_url` → `(entity_type='session', image_type='scene', status='ready')`
- `players.character_image_url` → `(entity_type='player', image_type='character', status='ready')`
- `messages.image_url` → `(entity_type='message', image_type='inline', status='ready')`

Only non-null URLs are backfilled. `storage_path` is derived from the known path patterns.

## Unified Edge Function: `generate-image`

Replaces both `generate-image` (world images) and `generate-scene-image`. The old `generate-scene-image` function is deleted.

### Request shape

```json
{ "entity_type": "world", "entity_id": "<uuid>", "image_type": "cover" }
```

### Flow

1. Insert `images` row with `status='generating'`
2. Fetch the entity row to build the Gemini prompt (switch on `entity_type` + `image_type`)
3. Call Gemini, upload PNG to `campaign-images` bucket
4. Update `images` row: `status='ready'`, `storage_path`, `public_url`
5. Denormalize URL back to parent column (e.g. `worlds.cover_image_url`)
6. Broadcast `image:ready` on the entity's Realtime channel

On failure: update `images` row to `status='failed'`, write `error` message.

### Storage paths (unchanged)

- `worlds/{world_id}/{cover|map}.png`
- `sessions/{session_id}/scene.png`
- `players/{player_id}/character.png` *(future)*

### Prompt routing

| entity_type | image_type | Prompt source |
|---|---|---|
| world | cover | `worlds.world_content` |
| world | map | `worlds.world_content` |
| session | scene | world content + player list |
| player | character | character name, class, backstory *(future)* |

## Future work (out of scope)

- Drop `_url` columns from parent tables
- Add `player` and `message` image generation support
- Idempotency: check for existing `generating`/`ready` row before creating a new one
