'use client'

import Link from 'next/link'
import { Standing } from '@/lib/supabase'

interface Props {
  standings: Standing[]
  tournamentId: string
  favoriteTeamIds?: string[]
  onToggleFavorite?: (teamId: string) => void
}

export function StandingsTable({ standings, tournamentId, favoriteTeamIds = [], onToggleFavorite }: Props) {
  const sorted = [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.goals_for - a.goals_against
    const gdB = b.goals_for - b.goals_against
    if (gdB !== gdA) return gdB - gdA
    return b.goals_for - a.goals_for
  })

  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
            <th className="px-3 py-2 text-left w-8 font-medium" style={{ color: 'var(--text-secondary)' }}>#</th>
            <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Team</th>
            <th className="px-2 py-2 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>Gs</th>
            <th className="px-2 py-2 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>W</th>
            <th className="px-2 py-2 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>G</th>
            <th className="px-2 py-2 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>V</th>
            <th className="px-2 py-2 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>+/-</th>
            <th className="px-2 py-2 text-center font-bold" style={{ color: 'var(--orange)' }}>Pnt</th>
            {onToggleFavorite && <th className="px-2 py-2 w-8" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const isFav = favoriteTeamIds.includes(s.team_id)
            return (
              <tr
                key={s.team_id}
                className="transition-colors"
                style={{
                  borderBottom: '1px solid var(--border)',
                  backgroundColor: isFav ? '#FF6B0011' : 'var(--bg-card)',
                }}
              >
                <td className="px-3 py-2.5 font-mono text-center" style={{ color: 'var(--text-secondary)' }}>
                  {i + 1}
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/tournament/${tournamentId}/team/${s.team_id}`}
                    className="flex items-center gap-2 hover:opacity-80 font-medium"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.team?.color || 'var(--orange)' }}
                    />
                    {s.team?.name ?? '—'}
                    {isFav && <span style={{ color: 'var(--orange)' }}>★</span>}
                  </Link>
                </td>
                <td className="px-2 py-2.5 text-center">{s.played}</td>
                <td className="px-2 py-2.5 text-center" style={{ color: 'var(--green)' }}>{s.won}</td>
                <td className="px-2 py-2.5 text-center" style={{ color: 'var(--text-secondary)' }}>{s.drawn}</td>
                <td className="px-2 py-2.5 text-center" style={{ color: 'var(--red)' }}>{s.lost}</td>
                <td className="px-2 py-2.5 text-center font-mono">
                  {s.goals_for - s.goals_against > 0 ? '+' : ''}{s.goals_for - s.goals_against}
                </td>
                <td className="px-2 py-2.5 text-center font-bold" style={{ color: 'var(--orange)' }}>
                  {s.points}
                </td>
                {onToggleFavorite && (
                  <td className="px-2 py-2.5 text-center">
                    <button
                      onClick={() => onToggleFavorite(s.team_id)}
                      className="text-lg cursor-pointer hover:scale-110 transition-transform"
                      title={isFav ? 'Verwijder favoriet' : 'Voeg toe als favoriet'}
                    >
                      {isFav ? '★' : '☆'}
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                Nog geen standen beschikbaar
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
