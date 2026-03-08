export type Message = {
  id: string
  campaign_id: string
  player_id: string | null
  content: string
  type: 'action' | 'narration' | 'system' | 'ooc'
  created_at: string
  client_id?: string | null
}

export type MessageInsert = Pick<Message, 'campaign_id' | 'content' | 'type'> & {
  player_id?: string
  client_id?: string | null
}
