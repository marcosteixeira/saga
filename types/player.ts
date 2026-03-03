export type Player = {
  id: string
  campaign_id: string
  session_token: string
  username: string
  character_name: string | null
  character_class: string | null
  character_backstory: string | null
  character_image_url: string | null
  stats: { hp: number; hp_max: number }
  status: 'active' | 'dead' | 'incapacitated' | 'absent'
  absence_mode: 'skip' | 'npc' | 'auto_act'
  is_host: boolean
  last_seen_at: string
  joined_at: string
}

export type PlayerInsert = Pick<
  Player,
  'campaign_id' | 'session_token' | 'username'
> & {
  character_name?: string
  character_class?: string
  character_backstory?: string
  is_host?: boolean
}
