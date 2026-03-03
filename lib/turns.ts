import { createServerSupabaseClient } from '@/lib/supabase/server'

const ACTIVE_STATUSES = ['active']

export async function checkAllPlayersSubmitted(
  campaignId: string,
  sessionId: string
): Promise<{
  allSubmitted: boolean
  submitted: string[]
  pending: string[]
  total: number
}> {
  const supabase = createServerSupabaseClient()

  // 1. Get all active players
  const { data: players } = await supabase
    .from('players')
    .select('id, status')
    .eq('campaign_id', campaignId)
    .in('status', ACTIVE_STATUSES)
  const activePlayers = players ?? []
  const activePlayerIds = activePlayers.map((p: { id: string }) => p.id)

  // 2. Get last narration in this session
  const { data: lastNarration } = await supabase
    .from('messages')
    .select('created_at')
    .eq('campaign_id', campaignId)
    .eq('session_id', sessionId)
    .eq('type', 'narration')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const sinceTime = lastNarration?.created_at ?? new Date(0).toISOString()

  // 3. Get all actions since last narration
  const { data: actions } = await supabase
    .from('messages')
    .select('player_id')
    .eq('campaign_id', campaignId)
    .eq('session_id', sessionId)
    .eq('type', 'action')
    .gt('created_at', sinceTime)
  const submittedIds = [...new Set((actions ?? []).map((a: { player_id: string }) => a.player_id))]

  const submitted = activePlayerIds.filter((id: string) => submittedIds.includes(id))
  const pending = activePlayerIds.filter((id: string) => !submittedIds.includes(id))

  return {
    allSubmitted: pending.length === 0 && activePlayers.length > 0,
    submitted,
    pending,
    total: activePlayers.length,
  }
}

export async function maybeTriggerNarration(
  campaignId: string,
  sessionId: string
): Promise<boolean> {
  const { allSubmitted } = await checkAllPlayersSubmitted(campaignId, sessionId)
  if (!allSubmitted) return false

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  await fetch(`${baseUrl}/api/campaign/${campaignId}/narrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  })

  return true
}
