-- Players: readiness flag for lobby
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_ready BOOLEAN NOT NULL DEFAULT false;

-- Worlds: allow players in a campaign to read that campaign's world
CREATE POLICY "worlds_select_campaign_players"
  ON worlds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      JOIN players p ON p.campaign_id = c.id
      WHERE c.world_id = worlds.id
        AND p.user_id = auth.uid()
    )
  );

-- Images: unique index for singleton image types (cover, map) per entity
CREATE UNIQUE INDEX IF NOT EXISTS images_singleton_unique
  ON images (entity_type, entity_id, image_type)
  WHERE image_type IN ('cover', 'map');
