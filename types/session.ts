export type Session = {
  id: string
  campaign_id: string
  session_number: number
  present_player_ids: string[]
  summary_md: string | null
  opening_situation: string | null
  starting_hooks: string[] | null
  started_at: string
  ended_at: string | null
}

export type SessionInsert = Pick<
  Session,
  'campaign_id' | 'session_number'
> & {
  present_player_ids?: string[]
}
