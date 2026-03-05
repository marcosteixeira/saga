-- Move opening_situation and starting_hooks from sessions to campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS opening_situation text,
  ADD COLUMN IF NOT EXISTS starting_hooks text[];

-- Drop sessions table (no longer needed)
DROP TABLE IF EXISTS sessions;
