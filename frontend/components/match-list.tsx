'use client'

import { Match } from '@/lib/types'
import { LEAGUES } from '@/lib/types'
import { groupMatchesByLeague, formatMatchDate } from '@/lib/mock-data'
import { MatchCard } from './match-card'
import { LeagueHeader } from './league-selector'
import { Calendar } from 'lucide-react'

interface MatchListProps {
  matches: Match[]
  selectedLeague: string
  onMatchClick?: (match: Match) => void
}

export function MatchList({ matches, selectedLeague, onMatchClick }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground">Aucun match à venir</h3>
        <p className="text-muted-foreground mt-1">
          Il n&apos;y a pas de match programmé pour cette sélection
        </p>
      </div>
    )
  }

  // Group by league if showing all
  if (selectedLeague === 'all') {
    const groupedMatches = groupMatchesByLeague(matches)
    
    return (
      <div className="space-y-6">
        {Object.entries(groupedMatches).map(([leagueName, leagueMatches]) => {
          const league = LEAGUES.find(l => l.name === leagueName)
          if (!league) return null

          return (
            <div key={leagueName} className="bg-card rounded-xl overflow-hidden border border-border">
              <LeagueHeader league={league} />
              <div className="divide-y divide-border">
                {leagueMatches.map((match) => (
                  <MatchCard 
                    key={match.id} 
                    match={match} 
                    onClick={() => onMatchClick?.(match)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Single league view
  const league = LEAGUES.find(l => l.id === selectedLeague)
  
  return (
    <div className="bg-card rounded-xl overflow-hidden border border-border">
      {league && <LeagueHeader league={league} />}
      <div className="divide-y divide-border">
        {matches.map((match) => (
          <MatchCard 
            key={match.id} 
            match={match} 
            onClick={() => onMatchClick?.(match)}
          />
        ))}
      </div>
    </div>
  )
}

interface DateGroupedMatchListProps {
  matches: Match[]
  onMatchClick?: (match: Match) => void
}

export function DateGroupedMatchList({ matches, onMatchClick }: DateGroupedMatchListProps) {
  const groupedByDate = matches.reduce((acc, match) => {
    const date = match.matchDate.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(match)
    return acc
  }, {} as Record<string, Match[]>)

  return (
    <div className="space-y-6">
      {Object.entries(groupedByDate).map(([date, dateMatches]) => (
        <div key={date}>
          <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{formatMatchDate(dateMatches[0].matchDate)}</span>
          </div>
          <div className="bg-card rounded-xl overflow-hidden border border-border divide-y divide-border">
            {dateMatches.map((match) => (
              <MatchCard 
                key={match.id} 
                match={match}
                onClick={() => onMatchClick?.(match)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
