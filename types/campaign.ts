export type Campaign = {
  id: string;
  slug: string;
  name: string;
  host_username: string;
  host_user_id: string;
  world_id: string;
  system_description: string | null;
  status: 'lobby' | 'active' | 'paused' | 'ended';
  turn_mode: 'free' | 'sequential';
  turn_timer_seconds: number;
  last_response_id: string | null;
  created_at: string;
  cover_url?: string | null;
};

export type CampaignInsert = Pick<
  Campaign,
  'name' | 'host_username' | 'host_user_id' | 'world_id'
> & {
  system_description?: string;
};
