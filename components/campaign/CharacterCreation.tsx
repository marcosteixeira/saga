'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { Player } from '@/types'

interface Props {
  campaignId: string
  onJoined: (player: Player) => void
}

export function CharacterCreation({ campaignId, onJoined }: Props) {
  const [characterName, setCharacterName] = useState('')
  const [characterClass, setCharacterClass] = useState('')
  const [backstory, setBackstory] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaign/${campaignId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_name: characterName || undefined,
          character_class: characterClass || undefined,
          character_backstory: backstory || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      onJoined(data.player)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded border-2 border-[--copper] bg-[--iron] p-6"
      style={{ boxShadow: 'inset 0 0 20px rgba(184,115,51,0.1)' }}
    >
      <div>
        <Label
          htmlFor="character-name"
          className="font-mono text-xs uppercase tracking-widest text-[--copper]"
        >
          Character Name
        </Label>
        <Input
          id="character-name"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          placeholder="What do they call you?"
          disabled={isSubmitting}
          className="mt-1 border-[--gunmetal] bg-[--iron] focus:border-[--brass]"
        />
      </div>
      <div>
        <Label
          htmlFor="character-class"
          className="font-mono text-xs uppercase tracking-widest text-[--copper]"
        >
          Character Class
        </Label>
        <Input
          id="character-class"
          value={characterClass}
          onChange={(e) => setCharacterClass(e.target.value)}
          placeholder="e.g., Warrior, Mage, Rogue, Healer..."
          disabled={isSubmitting}
          className="mt-1 border-[--gunmetal] bg-[--iron] focus:border-[--brass]"
        />
      </div>
      <div>
        <Label
          htmlFor="backstory"
          className="font-mono text-xs uppercase tracking-widest text-[--copper]"
        >
          Backstory
        </Label>
        <Textarea
          id="backstory"
          value={backstory}
          onChange={(e) => setBackstory(e.target.value)}
          placeholder="Tell us about your character's past..."
          disabled={isSubmitting}
          rows={4}
          className="mt-1 border-[--gunmetal] bg-[--iron] focus:border-[--brass]"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button
        type="submit"
        className="w-full bg-[--brass] text-black hover:bg-[--furnace] disabled:bg-[--gunmetal] disabled:text-[--ash] disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Joining...' : 'Join Campaign'}
      </Button>
    </form>
  )
}
