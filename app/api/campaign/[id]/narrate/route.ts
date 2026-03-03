import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/anthropic'
import { buildGMSystemPrompt } from '@/lib/prompts/gm-system'
import { formatMessageHistory } from '@/lib/prompts/message-history'
import { extractMemoryUpdate } from '@/lib/prompts/memory-update'
import { applyMemoryUpdate } from '@/lib/memory-updater'
import { generateAndStoreImage } from '@/lib/image-gen'
import type { Message, Player } from '@/types'

interface NarrateRequestBody {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const supabase = createServerSupabaseClient()

  // Validate campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, status, current_session_id, system_description')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'active') {
    return NextResponse.json({ error: 'Campaign is not active' }, { status: 400 })
  }

  const body: NarrateRequestBody = await req.json()
  const incomingMessages = body.messages ?? []

  // Fetch campaign memory files
  const { data: files } = await supabase
    .from('campaign_files')
    .select('filename, content')
    .eq('campaign_id', campaignId)

  const fileMap: Record<string, string> = {}
  for (const file of files ?? []) {
    fileMap[file.filename] = file.content
  }

  // Build system prompt
  const systemPrompt = buildGMSystemPrompt({
    worldMd: fileMap['WORLD.md'] ?? '',
    charactersMd: fileMap['CHARACTERS.md'] ?? '',
    npcsMd: fileMap['NPCS.md'] ?? '',
    locationsMd: fileMap['LOCATIONS.md'] ?? '',
    memoryMd: fileMap['MEMORY.md'] ?? '',
    systemDescription: campaign.system_description ?? undefined,
  })

  // Fetch recent message history from current session
  const { data: historyMessages } = await supabase
    .from('messages')
    .select('id, type, content, player_id, created_at')
    .eq('campaign_id', campaignId)
    .eq('session_id', campaign.current_session_id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch players for name resolution
  const { data: players } = await supabase
    .from('players')
    .select('id, username, character_name')
    .eq('campaign_id', campaignId)

  const history = formatMessageHistory(
    ((historyMessages ?? []) as Message[]).reverse(),
    (players ?? []) as Player[]
  )

  // Combine history with incoming messages
  const allMessages = [...history, ...incomingMessages]

  // Generate a temp message ID for broadcast
  const tempMessageId = `temp-${Date.now()}`

  // Set up Supabase broadcast channel
  const channel = supabase.channel(`campaign:${campaignId}:narration`)

  // Stream from Claude
  let fullContent = ''

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: allMessages.length > 0 ? allMessages : [{ role: 'user', content: 'Begin the adventure.' }],
    stream: true,
  })

  // Buffer tokens and broadcast in batches (~100ms)
  let buffer = ''
  let lastFlush = Date.now()

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      const text = event.delta.text
      buffer += text
      fullContent += text

      const now = Date.now()
      if (now - lastFlush >= 100) {
        await channel.send({
          type: 'broadcast',
          event: 'chunk',
          payload: { type: 'chunk', content: buffer, messageId: tempMessageId },
        })
        buffer = ''
        lastFlush = now
      }
    }
  }

  // Flush any remaining buffer
  if (buffer.length > 0) {
    await channel.send({
      type: 'broadcast',
      event: 'chunk',
      payload: { type: 'chunk', content: buffer, messageId: tempMessageId },
    })
  }

  // Extract MEMORY_UPDATE and GENERATE_IMAGE from full content
  const { narration: cleanNarration, memoryUpdate, generateImage } = extractMemoryUpdate(fullContent)

  // Save clean narration to messages table
  const { data: savedMessage } = await supabase
    .from('messages')
    .insert({
      campaign_id: campaignId,
      session_id: campaign.current_session_id,
      player_id: null,
      content: cleanNarration,
      type: 'narration',
    })
    .select()
    .single()

  const savedMessageId = savedMessage?.id ?? tempMessageId

  // Broadcast done event with clean narration
  await channel.send({
    type: 'broadcast',
    event: 'done',
    payload: { type: 'done', messageId: savedMessageId, fullContent: cleanNarration },
  })

  // Fire-and-forget: apply memory update
  if (memoryUpdate) {
    applyMemoryUpdate(campaignId, memoryUpdate).catch(() => { /* best-effort */ })
  }

  // Fire-and-forget: generate scene image
  if (generateImage) {
    generateAndStoreImage({
      prompt: generateImage,
      bucket: 'scene-images',
      path: `${campaignId}/${savedMessageId}.png`,
    }).catch(() => { /* best-effort */ })
  }

  return NextResponse.json({ messageId: savedMessageId }, { status: 200 })
}
