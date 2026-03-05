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
