'use client'

import Link from 'next/link'
import { Match } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'

const statusLabel: Record<string, string> = { scheduled: 'Gepland', live: 'LIVE', finished: 'Gespeeld', cancelled: 'Afgelast' }
const statusVariant: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'orange'> = { scheduled: 'gray', live: 'green', finished: 'gray', cancelled: 'red' }

export function MatchCard({ match, tournamentId }: { match: Match; tournamentId: string }) {
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${isLive ? 'var(--green)' : 'var(--border)'}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {match.field ? `Veld: ${match.field.name}` : `Wedstrijd #${match.match_number}`}
        </span>
        <Badge variant={statusVariant[match.status]}>{statusLabel[match.status]}</Badge>
      </div>

      {/* Teams + Score */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/tournament/${tournamentId}/team/${match.home_team_id}`}
          className="flex-1 flex items-center gap-2 font-semibold hover:opacity-80 min-w-0"
        >
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }}
          />
          <span className="truncate">{match.home_team?.name ?? '—'}</span>
        </Link>

        <div
          className="flex items-center gap-2 px-3 py-1 rounded-lg font-mono font-bold text-lg flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-elevated)', minWidth: '70px', justifyContent: 'center' }}
        >
          {isFinished || isLive ? (
            <>
              <span style={{ color: isFinished && (match.home_score ?? 0) > (match.away_score ?? 0) ? 'var(--green)' : 'inherit' }}>
                {match.home_score ?? 0}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>-</span>
              <span style={{ color: isFinished && (match.away_score ?? 0) > (match.home_score ?? 0) ? 'var(--green)' : 'inherit' }}>
                {match.away_score ?? 0}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>vs</span>
          )}
        </div>

        <Link
          href={`/tournament/${tournamentId}/team/${match.away_team_id}`}
          className="flex-1 flex items-center justify-end gap-2 font-semibold hover:opacity-80 min-w-0"
        >
          <span className="truncate text-right">{match.away_team?.name ?? '—'}</span>
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: match.away_team?.color || '#888' }}
          />
        </Link>
      </div>
    </div>
  )
}
