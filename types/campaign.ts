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
  opening_situation: string | null;
  starting_hooks: string[] | null;
  created_at: string;
};

export type CampaignInsert = Pick<
  Campaign,
  'name' | 'host_username' | 'host_user_id' | 'world_id'
> & {
  system_description?: string;
};
