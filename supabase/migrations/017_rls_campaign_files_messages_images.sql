-- Enable RLS on campaign_files, messages, and images

-- campaign_files RLS
ALTER TABLE campaign_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign members can read campaign_files"
  ON campaign_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_files.campaign_id
        AND (
          c.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM players p
            WHERE p.campaign_id = c.id AND p.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "host can manage campaign_files"
  ON campaign_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_files.campaign_id
        AND c.host_user_id = auth.uid()
    )
  );

-- messages RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign members can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = messages.campaign_id
        AND (
          c.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM players p
            WHERE p.campaign_id = c.id AND p.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "players can insert own messages"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = messages.campaign_id
        AND (
          c.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM players p
            WHERE p.campaign_id = c.id AND p.user_id = auth.uid()
          )
        )
    )
  );

-- images RLS
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read images"
  ON images FOR SELECT
  USING (true);
