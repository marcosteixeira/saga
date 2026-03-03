export type Campaign = {
  id: string
  name: string
  host_username: string
  host_user_id: string
  world_description: string
  system_description: string | null
  cover_image_url: string | null
  map_image_url: string | null
  status: 'lobby' | 'active' | 'paused' | 'ended'
  turn_mode: 'free' | 'sequential'
  turn_timer_seconds: number
  current_session_id: string | null
  created_at: string
}

export type CampaignInsert = Pick<
  Campaign,
  'name' | 'host_username' | 'host_user_id' | 'world_description'
> & {
  system_description?: string
  cover_image_url?: string
  map_image_url?: string
}
