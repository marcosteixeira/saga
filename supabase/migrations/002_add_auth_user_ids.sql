-- Migration: replace session token columns with auth.users FK references + enable RLS

-- campaigns: replace host_session_token with host_user_id FK
ALTER TABLE campaigns
  DROP COLUMN host_session_token,
  ADD COLUMN host_user_id UUID REFERENCES auth.users(id) NOT NULL;

-- players: replace session_token with user_id FK
ALTER TABLE players
  DROP COLUMN session_token,
  ADD COLUMN user_id UUID REFERENCES auth.users(id) NOT NULL;

-- RLS on campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read campaigns"
  ON campaigns FOR SELECT USING (true);
CREATE POLICY "authenticated users can insert campaigns"
  ON campaigns FOR INSERT WITH CHECK (auth.uid() = host_user_id);
CREATE POLICY "host can update own campaign"
  ON campaigns FOR UPDATE USING (auth.uid() = host_user_id);
CREATE POLICY "host can delete own campaign"
  ON campaigns FOR DELETE USING (auth.uid() = host_user_id);

-- RLS on players
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read players"
  ON players FOR SELECT USING (true);
CREATE POLICY "authenticated users can insert players"
  ON players FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "player can update own row"
  ON players FOR UPDATE USING (auth.uid() = user_id);
