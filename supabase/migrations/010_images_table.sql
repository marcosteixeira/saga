-- supabase/migrations/010_images_table.sql

CREATE TABLE images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  image_type    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  storage_path  TEXT,
  public_url    TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_images_entity ON images(entity_type, entity_id);
CREATE INDEX idx_images_status ON images(status);

-- Reuse set_updated_at() trigger already defined in 001_initial.sql
CREATE TRIGGER images_set_updated_at
BEFORE UPDATE ON images
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
