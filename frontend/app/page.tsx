'use client'

import { useState, useMemo, useEffect } from 'react'
import { Header } from '@/components/header'
import { LeagueSelector } from '@/components/league-selector'
import { MatchList } from '@/components/match-list'
import { RiskFilter } from '@/components/risk-filter'
import { StatsBar } from '@/components/stats-bar'
import { MatchDetailModal } from '@/components/match-detail-modal'
import { Match, RiskLevel, LEAGUES } from '@/lib/types'
import { getUpcomingMatches } from '@/lib/api'

export default function HomePage() {
  // On gère les vrais matchs et le chargement
  const [matches, setMatches] = useState<Match[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selectedLeague, setSelectedLeague] = useState('all')
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel | 'all'>('all')
  const [targetOdds, setTargetOdds] = useState(2.0)
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)

  // On récupère les données au chargement de la page
  useEffect(() => {
    async function loadMatches() {
      const data = await getUpcomingMatches()
      setMatches(data)
      setIsLoading(false)
    }
    loadMatches()
  }, [])

  const filteredMatches = useMemo(() => {
    let currentMatches = matches

    if (selectedLeague !== 'all') {
      const leagueName = LEAGUES.find(l => l.id === selectedLeague)?.name
      currentMatches = currentMatches.filter(m => m.league === leagueName)
    }

    if (selectedRisk !== 'all') {
      currentMatches = currentMatches.filter(m => {
        if (!m.odds) return false
        const minOdd = Math.min(m.odds.home, m.odds.draw, m.odds.away)
        switch (selectedRisk) {
          case 'low': return minOdd < 1.80
          case 'medium': return minOdd >= 1.80 && minOdd <= 2.50
          case 'high': return minOdd > 2.50
          default: return true
        }
      })
    }

    return currentMatches.sort((a, b) => 
      new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime()
    )
  }, [selectedLeague, selectedRisk, matches])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LeagueSelector 
        selectedLeague={selectedLeague} 
        onLeagueChange={setSelectedLeague} 
      />
      
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <StatsBar matches={matches} />
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1 space-y-6">
            <RiskFilter
              selectedRisk={selectedRisk}
              onRiskChange={setSelectedRisk}
              targetOdds={targetOdds}
              onTargetOddsChange={setTargetOdds}
            />
            
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="font-semibold text-foreground mb-3">Top Picks du jour</h3>
              
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : (
                <div className="space-y-3">
                  {matches
                    .filter(m => (m.confidenceScore || 0) >= 80)
                    .slice(0, 3)
                    .map((match) => (
                      <button
                        key={match.id}
                        onClick={() => setSelectedMatch(match)}
                        className="w-full text-left p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{match.league}</span>
                          <span className="text-xs font-bold text-green-400">{match.confidenceScore}%</span>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {match.homeTeam.shortName} vs {match.awayTeam.shortName}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>1: {match.odds?.home.toFixed(2) || '-'}</span>
                          <span>X: {match.odds?.draw.toFixed(2) || '-'}</span>
                          <span>2: {match.odds?.away.toFixed(2) || '-'}</span>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </aside>

          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">
                Matchs à venir
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredMatches.length} matchs)
                </span>
              </h2>
            </div>
            
            {isLoading ? (
              <div className="flex justify-center py-20">
                <p className="text-muted-foreground">Chargement des matchs en cours...</p>
              </div>
            ) : (
              <MatchList 
                matches={filteredMatches}
                selectedLeague={selectedLeague}
                onMatchClick={setSelectedMatch}
              />
            )}
          </div>
        </div>
      </main>

      <MatchDetailModal
        match={selectedMatch}
        open={!!selectedMatch}
        onClose={() => setSelectedMatch(null)}
      />
    </div>
  )
}