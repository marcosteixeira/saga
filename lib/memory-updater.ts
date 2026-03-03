import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCampaignFile, upsertCampaignFile } from '@/lib/memory'
import type { MemoryUpdate } from '@/lib/prompts/memory-update'

function upsertSection(existing: string, name: string, section: string): string {
  const sectionHeader = `## ${name}`
  const headerIdx = existing.indexOf(sectionHeader)
  if (headerIdx === -1) {
    const separator = existing.trim().length > 0 ? '\n\n' : ''
    return existing + separator + section
  }
  // Find the end of the section (next ## or end of string)
  const afterHeader = existing.indexOf('\n## ', headerIdx + 1)
  if (afterHeader === -1) {
    return existing.slice(0, headerIdx) + section
  }
  return existing.slice(0, headerIdx) + section + '\n\n' + existing.slice(afterHeader + 1)
}

export async function applyMemoryUpdate(campaignId: string, update: MemoryUpdate): Promise<void> {
  const promises: Promise<unknown>[] = []

  // Update MEMORY.md
  if (update.memory_md !== undefined) {
    promises.push(upsertCampaignFile(campaignId, 'MEMORY.md', update.memory_md))
  }

  // Update NPCS.md
  if (update.npcs && update.npcs.length > 0) {
    promises.push(
      (async () => {
        let content = (await getCampaignFile(campaignId, 'NPCS.md')) ?? ''
        for (const npc of update.npcs!) {
          const lines: string[] = [`## ${npc.name}`]
          if (npc.status) lines.push(`- **Status:** ${npc.status}`)
          if (npc.disposition) lines.push(`- **Disposition:** ${npc.disposition}`)
          if (npc.note) lines.push(`- **Note:** ${npc.note}`)
          content = upsertSection(content, npc.name, lines.join('\n'))
        }
        await upsertCampaignFile(campaignId, 'NPCS.md', content)
      })()
    )
  }

  // Update LOCATIONS.md
  if (update.locations && update.locations.length > 0) {
    promises.push(
      (async () => {
        let content = (await getCampaignFile(campaignId, 'LOCATIONS.md')) ?? ''
        for (const loc of update.locations!) {
          const lines: string[] = [`## ${loc.name}`]
          if (loc.status) lines.push(`- **Status:** ${loc.status}`)
          if (loc.note) lines.push(`- **Note:** ${loc.note}`)
          content = upsertSection(content, loc.name, lines.join('\n'))
        }
        await upsertCampaignFile(campaignId, 'LOCATIONS.md', content)
      })()
    )
  }

  // Update CHARACTERS.md and player stats
  if (update.character_updates && update.character_updates.length > 0) {
    for (const charUpdate of update.character_updates) {
      if (charUpdate.hp !== undefined) {
        promises.push(
          (async () => {
            const supabase = createServerSupabaseClient()
            const { data: player } = await supabase
              .from('players')
              .select('id, stats')
              .eq('campaign_id', campaignId)
              .eq('character_name', charUpdate.name)
              .maybeSingle()
            if (player) {
              const currentStats = (player.stats as Record<string, unknown>) ?? {}
              await supabase
                .from('players')
                .update({ stats: { ...currentStats, hp: charUpdate.hp } })
                .eq('id', player.id)
            }
          })()
        )
      }
    }
  }

  await Promise.all(promises)
}
