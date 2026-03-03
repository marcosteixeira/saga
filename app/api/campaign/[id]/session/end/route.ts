import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/anthropic'
import { buildSessionSummaryPrompt } from '@/lib/prompts/session-summary'
import { upsertCampaignFile } from '@/lib/memory'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const supabase = createServerSupabaseClient()

  // 1. Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, status, host_user_id, current_session_id')
    .eq('id', campaignId)
    .single()

  if (!campaign || campaignError) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // 2. Check host
  if (campaign.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Check campaign is active
  if (campaign.status !== 'active') {
    return NextResponse.json({ error: 'Campaign is not active' }, { status: 400 })
  }

  const currentSessionId = campaign.current_session_id

  // 4. Fetch session to get session_number
  const { data: session } = await supabase
    .from('sessions')
    .select('id, session_number')
    .eq('id', currentSessionId)
    .single()

  // 5. Fetch all messages for the session
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('session_id', currentSessionId)
    .order('created_at')

  // 6. Fetch players for the campaign
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('campaign_id', campaignId)

  // 7. Generate summary via Claude
  const summaryResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: buildSessionSummaryPrompt(messages ?? [], players ?? []),
      },
    ],
  })
  const summaryText = summaryResponse.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  // 8. Update session row
  await supabase
    .from('sessions')
    .update({ summary_md: summaryText, ended_at: new Date().toISOString() })
    .eq('id', currentSessionId)

  // 9. Save summary as campaign file
  const sessionNumber = session?.session_number ?? 1
  await upsertCampaignFile(campaignId, `session-${sessionNumber}.md`, summaryText)

  // 10. Update campaign: paused, no current session
  await supabase
    .from('campaigns')
    .update({ status: 'paused', current_session_id: null })
    .eq('id', campaignId)

  // 11. Broadcast status change
  await supabase.channel(`campaign:${campaignId}`).send({
    type: 'broadcast',
    event: 'campaign_status',
    payload: { status: 'paused' },
  })

  return NextResponse.json({ summary: summaryText }, { status: 200 })
}
