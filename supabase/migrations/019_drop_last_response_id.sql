-- Drop last_response_id from campaigns.
-- Previously used for OpenAI conversation chain (null → pending → done).
-- Now replaced by checking messages table for existing narration (Anthropic migration).
ALTER TABLE campaigns DROP COLUMN IF EXISTS last_response_id;
