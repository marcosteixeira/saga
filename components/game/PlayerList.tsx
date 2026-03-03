import { Player } from '@/types'
import HPBar from '@/components/shared/HPBar'

const STATUS_COLOR: Record<Player['status'], string> = {
  active: 'var(--patina)',
  incapacitated: 'var(--amber-glow)',
  dead: 'var(--furnace)',
  absent: 'var(--ash)',
}

interface PlayerListProps {
  players: Player[]
  currentPlayer: Player | null
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function PlayerList({ players, currentPlayer }: PlayerListProps) {
  const nonHostPlayers = players.filter(p => !p.is_host)
  const showWaiting = nonHostPlayers.length === 0

  return (
    <div className="flex flex-col gap-2 p-2">
      {showWaiting && (
        <p
          className="text-center py-4 text-xs uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ash)' }}
        >
          Waiting for adventurers to join...
        </p>
      )}
      {players.map(player => {
        const isMe = currentPlayer?.id === player.id
        const displayName = player.character_name ?? player.username
        const hp = player.stats?.hp ?? 0
        const hpMax = player.stats?.hp_max ?? 20

        return (
          <div
            key={player.id}
            className="iron-plate p-2 relative"
            style={
              isMe
                ? { boxShadow: '0 0 8px rgba(196,148,61,0.4)', borderColor: 'var(--brass)' }
                : undefined
            }
          >
            <div className="rivet-bottom-left" style={{ width: 4, height: 4, bottom: 4, left: 4 }} />
            <div className="rivet-bottom-right" style={{ width: 4, height: 4, bottom: 4, right: 4 }} />

            <div className="flex items-start gap-2">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {player.character_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={player.character_image_url}
                    alt={displayName}
                    className="w-9 h-9 rounded-full object-cover"
                    style={{ border: '2px solid var(--brass)' }}
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      border: '2px solid var(--brass)',
                      background: 'var(--gunmetal)',
                      color: 'var(--brass)',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {getInitials(displayName)}
                  </div>
                )}
                {/* Status dot */}
                <span
                  className="absolute bottom-0 right-0 w-2 h-2 rounded-full"
                  style={{
                    background: STATUS_COLOR[player.status],
                    border: '1.5px solid var(--iron)',
                  }}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p
                  className="truncate leading-tight"
                  style={{
                    fontFamily: 'var(--font-heading), serif',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    color: isMe ? 'var(--brass)' : 'var(--steam)',
                  }}
                >
                  {displayName}
                </p>
                {player.character_class && (
                  <p
                    className="truncate uppercase"
                    style={{
                      fontFamily: 'var(--font-body), sans-serif',
                      fontSize: '0.6rem',
                      letterSpacing: '0.08em',
                      color: 'var(--ash)',
                    }}
                  >
                    {player.character_class}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-1.5">
              <HPBar hp={hp} hpMax={hpMax} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
