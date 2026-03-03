interface HPBarProps {
  hp: number
  hpMax: number
}

export default function HPBar({ hp, hpMax }: HPBarProps) {
  const pct = hpMax > 0 ? Math.max(0, Math.min(100, (hp / hpMax) * 100)) : 0
  const fillColor =
    pct > 50 ? 'var(--patina)' : pct > 25 ? 'var(--amber-glow)' : 'var(--furnace)'

  return (
    <div>
      <div
        className="w-full h-2 rounded-sm overflow-hidden"
        style={{ background: 'var(--gunmetal)' }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, background: fillColor }}
        />
      </div>
      <p
        className="text-right mt-0.5"
        style={{
          fontFamily: 'var(--font-mono), monospace',
          fontSize: '0.65rem',
          color: 'var(--ash)',
        }}
      >
        {hp} / {hpMax}
      </p>
    </div>
  )
}
