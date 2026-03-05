-- Move opening_situation and starting_hooks from sessions to campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS opening_situation text,
  ADD COLUMN IF NOT EXISTS starting_hooks text[];

DO $$
BEGIN
  -- Preserve existing opening content from the first session before removing sessions.
  IF to_regclass('public.sessions') IS NOT NULL THEN
    UPDATE campaigns c
    SET
      opening_situation = COALESCE(c.opening_situation, s.opening_situation),
      starting_hooks = COALESCE(c.starting_hooks, ARRAY(SELECT jsonb_array_elements_text(s.starting_hooks)))
    FROM sessions s
    WHERE s.campaign_id = c.id
      AND s.session_number = 1;
  END IF;
END $$;

-- Remove schema dependencies on sessions.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_session_id_fkey;
ALTER TABLE messages DROP COLUMN IF EXISTS session_id;
DROP INDEX IF EXISTS idx_messages_session_id;
ALTER TABLE campaigns DROP COLUMN IF EXISTS current_session_id;

-- Drop sessions table (no longer needed).
DROP TABLE IF EXISTS sessions;
