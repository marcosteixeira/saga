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
