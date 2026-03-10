-- Add next_round_at for Vercel after()-based debounce scheduling.
-- Each player action sets next_round_at = NOW() + ROUND_DEBOUNCE_SECONDS.
-- The after() worker fires after the debounce window and checks next_round_at <= NOW()
-- before proceeding. If a later action extended the timer, the worker skips.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS next_round_at TIMESTAMPTZ;

-- Remove messages table from realtime publication — replaced by broadcast.
-- This is safe to run even if messages is not currently in the publication.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  END IF;
END $$;
