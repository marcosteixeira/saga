'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { World } from '@/types'
import { fetchSelectableWorlds } from '@/components/campaign/world-vault'

type WorldMode = 'new' | 'existing'

export function WorldGenForm() {
  const router = useRouter()
  const [worldMode, setWorldMode] = useState<WorldMode>('new')
  const [worlds, setWorlds] = useState<World[]>([])
  const [totalWorldCount, setTotalWorldCount] = useState(0)
  const [worldsLoading, setWorldsLoading] = useState(false)
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [worldName, setWorldName] = useState('')
  const [worldDescription, setWorldDescription] = useState('')
  const [systemDescription, setSystemDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const worldsFetched = useRef(false)

  async function fetchWorlds() {
    if (worldsFetched.current) return
    setWorldsLoading(true)
    try {
      const result = await fetchSelectableWorlds()
      if (!result.ok) {
        setError(result.error)
        return
      }

      worldsFetched.current = true
      setWorlds(result.worlds)
      setTotalWorldCount(result.totalWorldCount)

      if (selectedWorldId && !result.worlds.some(world => world.id === selectedWorldId)) {
        setSelectedWorldId(null)
      }
    } finally {
      setWorldsLoading(false)
    }
  }

  function handleModeSwitch(mode: WorldMode) {
    setWorldMode(mode)
    setError(null)
    if (mode === 'existing') fetchWorlds()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsGenerating(true)

    try {
      let worldId: string

      if (worldMode === 'existing') {
        if (!selectedWorldId) {
          setError('Select a world from the vault.')
          setIsGenerating(false)
          return
        }
        worldId = selectedWorldId
      } else {
        // Step 1: Create the world
        const worldRes = await fetch('/api/world', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: worldName || name, description: worldDescription }),
        })
        const worldData = await worldRes.json()
        if (!worldRes.ok) {
          setError(worldData.error ?? 'Failed to create world.')
          setIsGenerating(false)
          return
        }
        worldId = worldData.id
      }

      // Step 2: Create the campaign
      const campaignRes = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          world_id: worldId,
          system_description: systemDescription || undefined,
        }),
      })

      const campaignData = await campaignRes.json()
      if (!campaignRes.ok) {
        setError(campaignData.error ?? 'Something went wrong. Check the gauges.')
        setIsGenerating(false)
        return
      }

      router.push(`/campaign/${campaignData.slug}/setup`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forge failure. Try again.')
      setIsGenerating(false)
    }
  }

  const selectedWorld = worlds.find(w => w.id === selectedWorldId)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {/* ── Campaign Name ───────────────────────────── */}
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

      {/* ── World Mode Selector ─────────────────────── */}
      <div className="flex flex-col gap-3">
        <span
          className="text-sm uppercase tracking-[0.1em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          World
        </span>

        {/* Mechanical valve toggle */}
        <div className="relative flex rounded-none overflow-hidden" style={{
          background: 'var(--iron)',
          border: '1px solid var(--gunmetal)',
          clipPath: 'polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)',
        }}>
          {/* Sliding indicator */}
          <div
            className="absolute top-0 bottom-0 transition-all duration-300 ease-in-out"
            style={{
              width: '50%',
              left: worldMode === 'new' ? '0%' : '50%',
              background: 'linear-gradient(180deg, var(--brass) 0%, var(--copper) 100%)',
              boxShadow: '0 0 12px rgba(196,148,61,0.3)',
            }}
          />

          <button
            type="button"
            onClick={() => handleModeSwitch('new')}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 py-3 transition-colors duration-200"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '0.75rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: worldMode === 'new' ? 'var(--soot)' : 'var(--ash)',
              fontWeight: worldMode === 'new' ? 700 : 400,
            }}
          >
            <ForgeIcon active={worldMode === 'new'} />
            Forge New
          </button>

          <button
            type="button"
            onClick={() => handleModeSwitch('existing')}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 py-3 transition-colors duration-200"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '0.75rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: worldMode === 'existing' ? 'var(--soot)' : 'var(--ash)',
              fontWeight: worldMode === 'existing' ? 700 : 400,
            }}
          >
            <VaultIcon active={worldMode === 'existing'} />
            From Vault
          </button>
        </div>

        {/* ── FORGE NEW WORLD panel ── */}
        {worldMode === 'new' && (
          <div className="flex flex-col gap-4" style={{ animation: 'slideIn 0.2s ease-out' }}>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="world_name"
                className="text-sm uppercase tracking-[0.1em]"
                style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
              >
                World Name
              </Label>
              <Input
                id="world_name"
                type="text"
                value={worldName}
                onChange={e => setWorldName(e.target.value)}
                placeholder="Aetherfall, The Shattered Reach…"
                className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
              />
            </div>

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
                required={worldMode === 'new'}
                value={worldDescription}
                onChange={e => setWorldDescription(e.target.value)}
                placeholder="A dark medieval kingdom where dragons have returned after a thousand years..."
                rows={4}
                className="resize-none border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
              />
              <p className="text-xs text-ash/60" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                The forge will generate full lore, factions &amp; geography from this seed.
              </p>
            </div>
          </div>
        )}

        {/* ── FROM VAULT panel ── */}
        {worldMode === 'existing' && (
          <div style={{ animation: 'slideIn 0.2s ease-out' }}>
            {worldsLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <div className="piston-loader w-24" />
                <span className="text-xs text-ash/60 uppercase tracking-widest" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                  Scanning vault…
                </span>
              </div>
            ) : worlds.length === 0 ? (
              <div className="iron-plate p-6 text-center">
                <div className="rivet-bottom-left" /><div className="rivet-bottom-right" />
                <svg className="mx-auto mb-3 h-10 w-10 text-gunmetal" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeWidth={1} strokeLinecap="round" d="M3 7h18M3 12h18M3 17h18" />
                </svg>
                <p className="text-sm text-ash/70" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                  {totalWorldCount > 0
                    ? 'No ready worlds yet. Finish forging one, then select it here.'
                    : 'Vault empty. Forge your first world.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-ash/50 uppercase tracking-widest mb-1" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                  {worlds.length} ready world{worlds.length !== 1 ? 's' : ''} in vault — select one
                </p>
                <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--gunmetal) transparent' }}>
                  {worlds.map(world => (
                    <WorldCard
                      key={world.id}
                      world={world}
                      selected={selectedWorldId === world.id}
                      onSelect={() => setSelectedWorldId(world.id)}
                    />
                  ))}
                </div>
                {selectedWorld && (
                  <div className="mt-1 flex items-center gap-2 px-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-brass" style={{ boxShadow: '0 0 6px rgba(196,148,61,0.8)' }} />
                    <span className="text-xs text-brass/80" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                      {selectedWorld.name} locked in
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Custom Rules ────────────────────────────── */}
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

      {/* ── Error ───────────────────────────────────── */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* ── Submit ──────────────────────────────────── */}
      <Button
        type="submit"
        disabled={isGenerating || (worldMode === 'existing' && !selectedWorldId)}
        className="relative overflow-hidden bg-brass text-soot font-bold uppercase tracking-[0.15em] hover:bg-furnace transition-colors duration-300 disabled:opacity-40"
        style={{
          clipPath: 'polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)',
        }}
      >
        {isGenerating
          ? 'Forging…'
          : worldMode === 'existing'
            ? selectedWorldId ? 'Forge Campaign' : 'Select a World First'
            : 'Forge Campaign'}
      </Button>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </form>
  )
}

/* ── World Card ─────────────────────────────── */

function WorldCard({
  world,
  selected,
  onSelect,
}: {
  world: World
  selected: boolean
  onSelect: () => void
}) {
  const isReady = world.status === 'ready'
  const isGenerating = world.status === 'generating'
  const isError = world.status === 'error'

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative w-full text-left transition-all duration-200"
      style={{
        background: selected ? 'var(--smog)' : 'var(--iron)',
        border: selected ? '1px solid var(--brass)' : '1px solid var(--gunmetal)',
        clipPath: 'polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)',
        boxShadow: selected ? '0 0 16px rgba(196,148,61,0.2), inset 0 0 0 1px rgba(196,148,61,0.15)' : 'none',
      }}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Thumbnail */}
        <div className="relative shrink-0 h-12 w-16 overflow-hidden" style={{
          clipPath: 'polygon(4px 0%, calc(100% - 4px) 0%, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0% calc(100% - 4px), 0% 4px)',
          background: 'var(--smog)',
          border: selected ? '1px solid var(--brass)' : '1px solid var(--gunmetal)',
        }}>
          <div className="h-full w-full flex items-center justify-center">
              <GlobeIcon dimmed={!selected} />
            </div>
          {/* Overlay on selected */}
          {selected && (
            <div className="absolute inset-0 bg-brass/10" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="truncate text-sm font-medium"
              style={{
                fontFamily: 'var(--font-heading), serif',
                color: selected ? 'var(--brass)' : 'var(--steam)',
                letterSpacing: '0.05em',
              }}
            >
              {world.name}
            </span>
          </div>
          <p className="text-xs text-ash/60 truncate" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            {world.description.slice(0, 60)}{world.description.length > 60 ? '…' : ''}
          </p>
        </div>

        {/* Status badge + check */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {isReady && (
            <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5"
              style={{
                fontFamily: 'var(--font-mono), monospace',
                background: 'rgba(196,148,61,0.12)',
                border: '1px solid rgba(196,148,61,0.3)',
                color: 'var(--brass)',
              }}
            >
              Ready
            </span>
          )}
          {isGenerating && (
            <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5"
              style={{
                fontFamily: 'var(--font-mono), monospace',
                background: 'rgba(90,122,109,0.12)',
                border: '1px solid rgba(90,122,109,0.3)',
                color: 'var(--patina)',
              }}
            >
              Forging
            </span>
          )}
          {isError && (
            <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5"
              style={{
                fontFamily: 'var(--font-mono), monospace',
                background: 'rgba(224,85,85,0.12)',
                border: '1px solid rgba(224,85,85,0.3)',
                color: 'var(--rust)',
              }}
            >
              Error
            </span>
          )}
          {selected && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full"
              style={{ background: 'var(--brass)', boxShadow: '0 0 8px rgba(196,148,61,0.6)' }}
            >
              <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 3" stroke="var(--soot)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Hover shimmer */}
      {!selected && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(196,148,61,0.04), transparent)' }}
        />
      )}
    </button>
  )
}

/* ── Inline SVG Icons ────────────────────────── */

function ForgeIcon({ active }: { active: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.5 1.5M8 8l1.5 1.5M8 4L9.5 2.5M2.5 9.5L4 8"
        stroke={active ? 'var(--soot)' : 'var(--ash)'}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <circle cx="6" cy="6" r="1.5" fill={active ? 'var(--soot)' : 'var(--ash)'} />
    </svg>
  )
}

function VaultIcon({ active }: { active: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="2.5" width="9" height="7" rx="0.5"
        stroke={active ? 'var(--soot)' : 'var(--ash)'} strokeWidth={1.2} />
      <circle cx="6" cy="6" r="1.5"
        stroke={active ? 'var(--soot)' : 'var(--ash)'} strokeWidth={1.2} />
      <path d="M6 4.5V3M6 9v-1.5"
        stroke={active ? 'var(--soot)' : 'var(--ash)'} strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  )
}

function GlobeIcon({ dimmed }: { dimmed: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" opacity={dimmed ? 0.3 : 0.5}>
      <circle cx="10" cy="10" r="7" stroke="var(--brass)" strokeWidth={1} />
      <path d="M10 3c-2 2-3 4-3 7s1 5 3 7M10 3c2 2 3 4 3 7s-1 5-3 7M3 10h14" stroke="var(--brass)" strokeWidth={1} />
    </svg>
  )
}
