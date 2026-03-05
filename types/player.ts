export type Player = {
  id: string
  campaign_id: string
  user_id: string
  username: string
  character_name: string | null
  character_class: string | null
  character_backstory: string | null
  stats: { hp: number; hp_max: number }
  status: 'active' | 'dead' | 'incapacitated' | 'absent'
  absence_mode: 'skip' | 'npc' | 'auto_act'
  is_host: boolean
  is_ready: boolean
  last_seen_at: string
  joined_at: string
}

export type PlayerInsert = Pick<
  Player,
  'campaign_id' | 'user_id' | 'username'
> & {
  character_name?: string
  character_class?: string
  character_backstory?: string
  is_host?: boolean
}
