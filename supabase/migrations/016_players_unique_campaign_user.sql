-- Prevent duplicate player rows for the same user in the same campaign.
-- Required for upsert(onConflict: 'campaign_id,user_id') in the lobby page.
ALTER TABLE players
  ADD CONSTRAINT players_campaign_id_user_id_key UNIQUE (campaign_id, user_id);
