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

-- Messages: inline images (storage_path unknown; status=ready since URL exists)
INSERT INTO images (entity_type, entity_id, image_type, status, storage_path, public_url)
SELECT
  'message',
  id,
  'inline',
  'ready',
  NULL,
  image_url
FROM messages
WHERE image_url IS NOT NULL;
