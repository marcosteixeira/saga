-- campaigns (root table — must be first)
CREATE TABLE campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  host_username       TEXT NOT NULL,
  host_session_token  UUID NOT NULL,
  world_description   TEXT NOT NULL,
  system_description  TEXT,
  cover_image_url     TEXT,
  map_image_url       TEXT,
  status              TEXT DEFAULT 'lobby',
  turn_mode           TEXT DEFAULT 'free',
  turn_timer_seconds  INT DEFAULT 60,
  current_session_id  UUID,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- sessions (referenced by messages — must be before messages)
CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_number      INT NOT NULL,
  present_player_ids  UUID[] DEFAULT '{}',
  summary_md          TEXT,
  started_at          TIMESTAMPTZ DEFAULT now(),
  ended_at            TIMESTAMPTZ
);

-- players
CREATE TABLE players (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_token         UUID NOT NULL,
  username              TEXT NOT NULL,
  character_name        TEXT,
  character_class       TEXT,
  character_backstory   TEXT,
  character_image_url   TEXT,
  stats                 JSONB DEFAULT '{"hp": 20, "hp_max": 20}',
  status                TEXT DEFAULT 'active',
  absence_mode          TEXT DEFAULT 'skip',
  is_host               BOOLEAN DEFAULT false,
  last_seen_at          TIMESTAMPTZ DEFAULT now(),
  joined_at             TIMESTAMPTZ DEFAULT now()
);

-- messages (references sessions + players — must be last of these three)
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES sessions(id),
  player_id     UUID REFERENCES players(id),
  content       TEXT NOT NULL,
  image_url     TEXT,
  type          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- campaign_files (memory system)
CREATE TABLE campaign_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (campaign_id, filename)
);

-- Indexes for common query patterns
CREATE INDEX idx_players_campaign_id ON players(campaign_id);
CREATE INDEX idx_messages_campaign_created ON messages(campaign_id, created_at);
CREATE INDEX idx_campaign_files_campaign_id ON campaign_files(campaign_id);
CREATE INDEX idx_sessions_campaign_id ON sessions(campaign_id);
