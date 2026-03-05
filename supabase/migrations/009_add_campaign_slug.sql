-- Add slug column (nullable first to allow backfill)
ALTER TABLE campaigns ADD COLUMN slug TEXT;

-- Backfill existing campaigns: name → slug + first 6 chars of id for uniqueness
UPDATE campaigns
SET slug = regexp_replace(
    regexp_replace(
      lower(trim(regexp_replace(name, '[^a-zA-Z0-9\s]', '', 'g'))),
      '\s+', '-', 'g'
    ),
    '-+', '-', 'g'
  ) || '-' || substr(id::text, 1, 6)
WHERE slug IS NULL;

-- Make NOT NULL and UNIQUE
ALTER TABLE campaigns ALTER COLUMN slug SET NOT NULL;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_slug_unique UNIQUE (slug);

-- Index for fast slug lookups
CREATE INDEX idx_campaigns_slug ON campaigns(slug);
