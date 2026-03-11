// app/api/game-session/[id]/round/route.ts
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { broadcastGameEvent } from '@/lib/realtime-broadcast'
import { buildGMSystemPrompt, isFirstCallResponse, buildFirstCallInput } from '@/lib/game-session/prompt'
import { buildMessageHistory } from '@/lib/game-session/history'
import type { MsgRow } from '@/lib/game-session/types'

// Allow long-running AI calls on Vercel Pro (up to 300s)
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  // Auth: only service role key (called by Vercel after() worker or campaign start route)
  const authHeader = req.headers.get('authorization')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  let lockAcquired = false

  try {
    // Try to acquire round lock
    const { data: claimed, error: claimError } = await supabase
      .from('campaigns')
      .update({ round_in_progress: true })
      .eq('id', campaignId)
      .eq('round_in_progress', false)
      .select('id')

    if (claimError) {
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    if (!claimed?.length) {
      return NextResponse.json({ reason: 'lock_busy' }, { status: 409 })
    }

    lockAcquired = true

    // Check self-cancelling debounce: if next_round_at was pushed forward by a later action,
    // this worker is stale — release the lock and skip.
    const { data: campaignCheck } = await supabase
      .from('campaigns')
      .select('next_round_at, world_id')
      .eq('id', campaignId)
      .single()

    if (
      campaignCheck?.next_round_at &&
      new Date(campaignCheck.next_round_at) > new Date()
    ) {
      return NextResponse.json({ skipped: 'debounce_extended' })
    }

    await broadcastGameEvent(campaignId, 'round:started', {})

    // campaignCheck already has world_id from the debounce check above
    const campaign = campaignCheck
    if (!campaign) throw new Error('Campaign not found')

    // Check if this is the opening narration (no narration messages yet)
    const { data: existingNarration } = await supabase
      .from('messages')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('type', 'narration')
      .limit(1)

    const isFirstCall = !existingNarration?.length

    // Load world + players (needed for both first call and normal rounds)
    const [worldResult, playersResult] = await Promise.all([
      supabase.from('worlds').select('world_content').eq('id', campaign.world_id).single(),
      supabase.from('players')
        .select('id, character_name, character_class, character_backstory, username')
        .eq('campaign_id', campaignId),
    ])

    if (worldResult.error || !worldResult.data?.world_content) throw new Error('World not found')
    if (playersResult.error) throw new Error('Players not found')

    const systemPrompt = buildGMSystemPrompt(
      worldResult.data.world_content as string,
      playersResult.data ?? []
    )

    // CachedMsg allows either string or array content (for cache_control on last history msg)
    type CachedMsg = { role: 'user' | 'assistant'; content: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> }
    let messages: CachedMsg[]

    if (isFirstCall) {
      messages = [{ role: 'user', content: buildFirstCallInput() }]
    } else {
      // Atomically claim all unprocessed actions
      const { data: claimedActions, error: claimActionsError } = await supabase
        .from('messages')
        .update({ processed: true })
        .eq('campaign_id', campaignId)
        .eq('type', 'action')
        .eq('processed', false)
        .select('*')

      if (claimActionsError) throw claimActionsError

      if (!claimedActions?.length) {
        // No actions to process — signal clients (round:started already broadcast) then return.
        // Without this, clients are stuck with roundInProgress=true indefinitely.
        await broadcastGameEvent(campaignId, 'round:saved', {})
        return NextResponse.json({ ok: true, skipped: true })
      }

      // Load full conversation history
      const { data: historyRows, error: historyError } = await supabase
        .from('messages')
        .select('content, type, players(character_name, username)')
        .eq('campaign_id', campaignId)
        .in('type', ['action', 'narration'])
        .eq('processed', true)
        .order('created_at', { ascending: true })

      if (historyError) throw historyError

      const history = buildMessageHistory((historyRows ?? []) as unknown as MsgRow[])

      // Build player name map
      const playerIds = [...new Set(claimedActions.map((a) => a.player_id).filter(Boolean))]
      const { data: playerNameRows } = await supabase
        .from('players')
        .select('id, character_name, username')
        .in('id', playerIds)

      const playerNameMap = new Map(
        (playerNameRows ?? []).map((p) => [
          p.id as string,
          (p.character_name ?? p.username ?? 'Unknown') as string,
        ])
      )

      const currentInput = JSON.stringify(
        claimedActions.map((a) => ({
          playerName: playerNameMap.get(a.player_id ?? '') ?? 'Unknown',
          content: a.content,
        }))
      )

      // Apply prompt cache to last history message.
      const messagesWithCache: CachedMsg[] = history.map((msg, i) => {
        if (i === history.length - 1 && history.length > 0) {
          return {
            ...msg,
            content: [{ type: 'text' as const, text: msg.content, cache_control: { type: 'ephemeral' as const } }],
          }
        }
        return msg
      })

      messages = [...messagesWithCache, { role: 'user', content: currentInput }]
    }

    // Stream from Anthropic
    const rawStream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: isFirstCall ? 4096 : 1024,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    })

    let fullText = ''
    for await (const event of rawStream as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>) {
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta' &&
        event.delta.text
      ) {
        fullText += event.delta.text
        if (!isFirstCall) {
          await broadcastGameEvent(campaignId, 'chunk', { content: event.delta.text })
        }
      }
    }

    // Parse and save narration
    let narrationParts: string[]

    if (isFirstCall) {
      const cleanText = fullText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      let parsed: unknown
      try {
        parsed = JSON.parse(cleanText)
      } catch (parseErr) {
        throw new Error(`First-call JSON parse failed: ${String(parseErr)} — raw: ${cleanText.slice(0, 200)}`)
      }
      if (!isFirstCallResponse(parsed) || !Array.isArray(parsed.narration)) {
        throw new Error(`Invalid first-call response shape: ${JSON.stringify(Object.keys(parsed as object))}`)
      }
      narrationParts = parsed.narration
    } else {
      narrationParts = fullText
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    }

    if (!narrationParts.length) throw new Error('Empty narration')

    const { data: insertedRows, error: insertError } = await supabase
      .from('messages')
      .insert(
        narrationParts.map((paragraph) => ({
          campaign_id: campaignId,
          player_id: null,
          content: paragraph,
          type: 'narration' as const,
          client_id: null,
          processed: true,
        }))
      )
      .select('id, content, created_at')

    if (insertError) throw insertError

    // Broadcast each narration paragraph with its real DB id (prevents client-side dedup dropping duplicates)
    for (const row of insertedRows ?? []) {
      await broadcastGameEvent(campaignId, 'narration', {
        id: row.id,
        campaign_id: campaignId,
        player_id: null,
        content: row.content,
        type: 'narration',
        processed: true,
        created_at: row.created_at,
      })
    }

    await broadcastGameEvent(campaignId, 'round:saved', {})

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(JSON.stringify({ level: 'error', event: 'game_session.round_failed', campaignId, message }))
    await broadcastGameEvent(campaignId, 'round:error', { message: 'Failed to generate narration' })
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (lockAcquired) {
      await supabase
        .from('campaigns')
        .update({ round_in_progress: false, next_round_at: null })
        .eq('id', campaignId)
    }
  }
}
