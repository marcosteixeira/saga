'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function WorldGenForm() {
  const router = useRouter()
  const [hostUsername, setHostUsername] = useState('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const displayName = data.user?.user_metadata?.display_name
      if (displayName) setHostUsername(displayName)
    })
  }, [])
  const [name, setName] = useState('')
  const [worldDescription, setWorldDescription] = useState('')
  const [systemDescription, setSystemDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsGenerating(true)

    try {
      const res = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          host_username: hostUsername || undefined,
          world_description: worldDescription,
          system_description: systemDescription || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Check the gauges.')
        setIsGenerating(false)
        return
      }
      router.push(`/campaign/${data.id}/setup`)
      // keep isGenerating=true so the loader stays until the page unmounts
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'World generation failed in the background. Please try forging again.'
      setError(message)
      setIsGenerating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Display Name */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="host_username"
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Your Name{' '}
          <span className="text-ash/80 normal-case tracking-normal" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
            (optional — defaults to your email)
          </span>
        </Label>
        <Input
          id="host_username"
          type="text"
          value={hostUsername}
          onChange={e => setHostUsername(e.target.value)}
          placeholder="DungeonMaster42"
          className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Campaign Name */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="name"
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Campaign Name
        </Label>
        <Input
          id="name"
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="The Lost Mines of Karathos"
          className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Describe Your World */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="world_description"
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Describe Your World
        </Label>
        <Textarea
          id="world_description"
          required
          value={worldDescription}
          onChange={e => setWorldDescription(e.target.value)}
          placeholder="A dark medieval kingdom where dragons have returned after a thousand years..."
          rows={4}
          className="resize-none border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Custom Rules (optional) */}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="system_description"
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Custom Rules{' '}
          <span className="text-ash/80 normal-case tracking-normal" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
            (optional)
          </span>
        </Label>
        <Textarea
          id="system_description"
          value={systemDescription}
          onChange={e => setSystemDescription(e.target.value)}
          placeholder="Leave blank to use standard d20 rules"
          rows={3}
          className="resize-none border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={isGenerating}
        className="relative overflow-hidden bg-brass text-soot font-bold uppercase tracking-[0.15em] hover:bg-furnace transition-colors duration-300 disabled:opacity-60"
        style={{
          clipPath: 'polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)',
        }}
      >
        {isGenerating ? 'Forging...' : 'Forge Campaign'}
      </Button>
    </form>
  )
}
