-- Document new status values (status is plain TEXT, no enum to alter)
COMMENT ON COLUMN campaigns.status IS
  'generating | error | lobby | active | paused | ended';

-- Enable Realtime Postgres Changes for campaigns table.
-- Without this, client subscriptions to campaigns UPDATE events never fire.
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;

-- Enable Row Level Security.
-- Without RLS policies, Postgres Changes events are silently dropped on the client.
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Host can read their own campaign (required for Realtime to deliver events)
CREATE POLICY "host can read own campaign"
  ON campaigns FOR SELECT
  USING (auth.uid() = host_user_id);

-- Host can update their own campaign
CREATE POLICY "host can update own campaign"
  ON campaigns FOR UPDATE
  USING (auth.uid() = host_user_id);

-- Authenticated users can insert a campaign (they become the host)
CREATE POLICY "authenticated users can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (auth.uid() = host_user_id);
