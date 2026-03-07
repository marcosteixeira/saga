-- Add last_response_id to track OpenAI conversation chain position.
-- Drop opening_situation and starting_hooks: these are now stored in the
-- OpenAI conversation chain via previous_response_id chaining, not the DB.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS last_response_id text,
  DROP COLUMN IF EXISTS opening_situation,
  DROP COLUMN IF EXISTS starting_hooks;
