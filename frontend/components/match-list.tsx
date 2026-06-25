'use client'

import { Match, LEAGUES } from '@/lib/types'
import { MatchCard } from './match-card'
import { Calendar } from 'lucide-react'

interface MatchListProps {
  matches:       Match[]
  selectedLeague: string
  onMatchClick?: (match: Match) => void
}

export function MatchList({ matches, selectedLeague, onMatchClick }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Aucun match sur cette période</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Essaie une autre semaine ou passe en vue mois.
        </p>
      </div>
    )
  }

  if (selectedLeague === 'all') {
    // Grouper par championnat
    const byLeague: Record<string, Match[]> = {}
    for (const m of matches) {
      if (!byLeague[m.league]) byLeague[m.league] = []
      byLeague[m.league].push(m)
    }
    const order = LEAGUES.map(l => l.name)
    const sorted = Object.entries(byLeague).sort(
      ([a], [b]) => order.indexOf(a) - order.indexOf(b)
    )

    return (
      <div className="space-y-8">
        {sorted.map(([leagueName, leagueMatches]) => {
          const meta = LEAGUES.find(l => l.name === leagueName)
          return (
            <section key={leagueName}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{meta?.flag}</span>
                <h2 className="font-semibold text-foreground">{leagueName}</h2>
                <span className="text-xs text-muted-foreground">{leagueMatches.length} match{leagueMatches.length > 1 ? 's' : ''}</span>
              </div>
              <MatchGrid matches={leagueMatches} onMatchClick={onMatchClick} />
            </section>
          )
        })}
      </div>
    )
  }

  return <MatchGrid matches={matches} onMatchClick={onMatchClick} />
}

function MatchGrid({ matches, onMatchClick }: { matches: Match[]; onMatchClick?: (m: Match) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {matches.map(match => (
        <MatchCard key={match.id} match={match} onClick={() => onMatchClick?.(match)} />
      ))}
    </div>
  )
}
