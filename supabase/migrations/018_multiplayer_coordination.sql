-- Add client_id to messages so optimistic messages can be matched to DB rows
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id text;

-- Add processed flag to action messages. When runRound fires, it atomically
-- marks unprocessed action messages as processed (UPDATE ... RETURNING *) to
-- claim them for the round. This replaces a separate pending_actions table.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS processed boolean NOT NULL DEFAULT false;

-- Add round_in_progress lock to campaigns to prevent multiple isolates running
-- the same round concurrently.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS round_in_progress boolean NOT NULL DEFAULT false;

-- Enable Realtime postgres_changes for the messages table so all connected
-- clients receive inserts regardless of which isolate performed them.
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
