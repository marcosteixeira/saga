import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateAndStoreImage } from '@/lib/image-gen'

const PROMPT_PREFIXES: Record<string, string> = {
  cover: 'Fantasy RPG cover art, dark and atmospheric, steampunk elements, warm amber lighting, burnished metal textures, smog and steam:',
  map: 'Fantasy world map, parchment style, detailed regions, steampunk cartographic instrument aesthetic, copper accents:',
  scene: 'Fantasy RPG scene illustration, dramatic lighting, steampunk industrial elements, steam and amber glow:',
  character: 'Fantasy RPG character portrait, detailed, dramatic, steampunk attire, burnished metal details:',
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const body = await req.json()
  const { type, prompt, player_id } = body

  if (!type || !prompt) {
    return NextResponse.json({ error: 'Missing type or prompt' }, { status: 400 })
  }

  const prefix = PROMPT_PREFIXES[type] ?? ''
  const fullPrompt = `${prefix} ${prompt}`
  const path = player_id
    ? `campaign-${id}/character-${player_id}.png`
    : `campaign-${id}/${type}.png`

  const url = await generateAndStoreImage({
    prompt: fullPrompt,
    bucket: 'campaign-images',
    path,
  })

  // Update the appropriate DB column
  if (type === 'cover') {
    await supabase.from('campaigns').update({ cover_image_url: url }).eq('id', id)
  } else if (type === 'map') {
    await supabase.from('campaigns').update({ map_image_url: url }).eq('id', id)
  } else if (type === 'character' && player_id) {
    await supabase.from('players').update({ character_image_url: url }).eq('id', player_id)
  }

  return NextResponse.json({ url })
}
