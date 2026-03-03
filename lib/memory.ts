import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { CampaignFile, Player } from '@/types'

export async function getCampaignFile(
  campaignId: string,
  filename: string
): Promise<string | null> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('campaign_files')
    .select('content')
    .eq('campaign_id', campaignId)
    .eq('filename', filename)
    .single()
  if (error || !data) return null
  return data.content
}

export async function getCampaignFiles(campaignId: string): Promise<CampaignFile[]> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('campaign_files')
    .select('*')
    .eq('campaign_id', campaignId)
  return data ?? []
}

export async function upsertCampaignFile(
  campaignId: string,
  filename: string,
  content: string
): Promise<void> {
  const supabase = createServerSupabaseClient()
  await supabase
    .from('campaign_files')
    .upsert(
      { campaign_id: campaignId, filename, content },
      { onConflict: 'campaign_id,filename' }
    )
}

export async function appendCharacterToFile(
  campaignId: string,
  player: Player
): Promise<void> {
  const existing = (await getCampaignFile(campaignId, 'CHARACTERS.md')) ?? ''
  const section = [
    `## ${player.character_name ?? player.username}`,
    `- **Player:** ${player.username}`,
    player.character_class ? `- **Class:** ${player.character_class}` : null,
    `- **HP:** 20/20`,
    `- **Status:** Active`,
    player.character_backstory ? `- **Backstory:** ${player.character_backstory}` : null,
  ].filter(Boolean).join('\n')

  const separator = existing.trim().length > 0 ? '\n\n' : ''
  const updated = existing + separator + section
  await upsertCampaignFile(campaignId, 'CHARACTERS.md', updated)
}

export async function initializeCampaignFiles(
  campaignId: string,
  worldContent: string
): Promise<void> {
  const supabase = createServerSupabaseClient()
  const files = [
    { campaign_id: campaignId, filename: 'WORLD.md', content: worldContent },
    { campaign_id: campaignId, filename: 'CHARACTERS.md', content: '' },
    { campaign_id: campaignId, filename: 'NPCS.md', content: '' },
    { campaign_id: campaignId, filename: 'LOCATIONS.md', content: '' },
    { campaign_id: campaignId, filename: 'MEMORY.md', content: 'Campaign just started.' },
  ]
  for (const file of files) {
    await supabase
      .from('campaign_files')
      .upsert(file, { onConflict: 'campaign_id,filename' })
  }
}
