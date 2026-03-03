import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { TurnState } from '@/types'

type PlayerRow = {
  id: string
  status: string
  absence_mode: string
}

function shouldSkipPlayer(player: PlayerRow): boolean {
  if (player.status === 'dead') return true
  if (player.status === 'incapacitated') return true
  if (player.status === 'absent' && player.absence_mode === 'skip') return true
  return false
}

export async function advanceTurn(campaignId: string): Promise<{
  nextPlayerId: string | null
  roundComplete: boolean
  newRound: number
}> {
  const supabase = createServerSupabaseClient()

  // 1. Fetch campaign turn_state
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, turn_state')
    .eq('id', campaignId)
    .single()

  const turnState = campaign?.turn_state as TurnState | undefined
  if (!turnState?.order?.length) {
    return { nextPlayerId: null, roundComplete: false, newRound: 1 }
  }

  // 2. Fetch all players in order
  const { data: players } = await supabase
    .from('players')
    .select('id, status, absence_mode')
    .eq('campaign_id', campaignId)
    .in('id', turnState.order)
  const playerMap = new Map<string, PlayerRow>(
    (players ?? []).map((p: PlayerRow) => [p.id, p])
  )

  // 3. Find next non-skipped player
  const total = turnState.order.length
  let nextIndex = turnState.current_index + 1
  let roundComplete = false
  let newRound = turnState.round

  if (nextIndex >= total) {
    nextIndex = 0
    roundComplete = true
    newRound = turnState.round + 1
  }

  // Skip ineligible players (loop at most total times to avoid infinite loop)
  let attempts = 0
  while (attempts < total) {
    const candidateId = turnState.order[nextIndex]
    const candidate = playerMap.get(candidateId)
    if (!candidate || !shouldSkipPlayer(candidate)) break
    nextIndex++
    if (nextIndex >= total) {
      nextIndex = 0
      roundComplete = true
      newRound = turnState.round + 1
    }
    attempts++
  }

  const nextPlayerId = turnState.order[nextIndex] ?? null

  // 4. Update turn_state
  const newTurnState: TurnState = {
    order: turnState.order,
    current_index: nextIndex,
    round: newRound,
  }
  await supabase
    .from('campaigns')
    .update({ turn_state: newTurnState })
    .eq('id', campaignId)

  // 5. Broadcast turn change
  await supabase.channel(`campaign:${campaignId}:turn`).send({
    type: 'broadcast',
    event: 'turn_advanced',
    payload: {
      next_player_id: nextPlayerId,
      round_complete: roundComplete,
      round: newRound,
      current_index: nextIndex,
    },
  })

  return { nextPlayerId, roundComplete, newRound }
}

export async function getCurrentTurnPlayer(campaignId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('turn_state')
    .eq('id', campaignId)
    .single()

  const turnState = campaign?.turn_state as TurnState | undefined
  if (!turnState?.order?.length) return null

  return turnState.order[turnState.current_index] ?? null
}
