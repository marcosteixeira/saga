ALTER TABLE public.sessions ADD CONSTRAINT sessions_campaign_id_session_number_key UNIQUE (campaign_id, session_number);
