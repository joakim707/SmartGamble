'use client'

import { useState, useMemo, useEffect } from 'react'
import { Header } from '@/components/header'
import { LeagueSelector } from '@/components/league-selector'
import { MatchList } from '@/components/match-list'
import { RiskFilter } from '@/components/risk-filter'
import { StatsBar } from '@/components/stats-bar'
import { TeamFormView } from '@/components/team-form-view'
import { MatchDetailModal } from '@/components/match-detail-modal'
import { Match, RiskLevel, LEAGUES } from '@/lib/types'
import { getAllSeasonMatches, getTeamForms, TeamForm } from '@/lib/api'
import { cn } from '@/lib/utils'

type View         = 'matches' | 'form'
type StatusFilter = 'all' | 'upcoming' | 'finished'

export default function HomePage() {
  const [matches, setMatches]     = useState<Match[]>([])
  const [teamForms, setTeamForms] = useState<TeamForm[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [view, setView]           = useState<View>('matches')

  const [selectedLeague, setSelectedLeague]   = useState('all')
  const [selectedStatus, setSelectedStatus]   = useState<StatusFilter>('all')
  const [selectedRisk, setSelectedRisk]       = useState<RiskLevel | 'all'>('all')
  const [targetOdds, setTargetOdds]           = useState(2.0)
  const [selectedMatch, setSelectedMatch]     = useState<Match | null>(null)

  useEffect(() => {
    async function load() {
      const [matchData, formData] = await Promise.all([
        getAllSeasonMatches(),
        getTeamForms(),
      ])
      setMatches(matchData)
      setTeamForms(formData)
      setIsLoading(false)
    }
    load()
  }, [])

  const filteredMatches = useMemo(() => {
    let current = matches

    if (selectedLeague !== 'all') {
      const leagueName = LEAGUES.find(l => l.id === selectedLeague)?.name
      current = current.filter(m => m.league === leagueName)
    }

    if (selectedStatus !== 'all') {
      if (selectedStatus === 'upcoming') {
        current = current.filter(m => m.status === 'upcoming' || m.status === 'live')
      } else {
        current = current.filter(m => m.status === selectedStatus)
      }
    }

    if (selectedRisk !== 'all') {
      current = current.filter(m => {
        if (!m.odds) return false
        const minOdd = Math.min(m.odds.home, m.odds.draw, m.odds.away)
        switch (selectedRisk) {
          case 'low':    return minOdd < 1.80
          case 'medium': return minOdd >= 1.80 && minOdd <= 2.50
          case 'high':   return minOdd > 2.50
          default:       return true
        }
      })
    }

    // À venir : ordre croissant (prochain en premier)
    // Terminés : ordre décroissant (le plus récent en premier)
    if (selectedStatus === 'upcoming') {
      return current.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime())
    }
    return current.sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime())
  }, [selectedLeague, selectedStatus, selectedRisk, matches])

  const upcomingTopPicks = useMemo(() =>
    matches.filter(m => (m.status === 'upcoming' || m.status === 'live') && (m.confidenceScore || 0) >= 80).slice(0, 3),
    [matches]
  )

  const statusButtons: { label: string; value: StatusFilter }[] = [
    { label: 'Tous',      value: 'all'      },
    { label: 'A venir',   value: 'upcoming' },
    { label: 'Terminés',  value: 'finished' },
  ]

  return (
    <div className="h-screen flex flex-col bg-background overflow-y-auto">
      <Header />
      <LeagueSelector
        selectedLeague={selectedLeague}
        onLeagueChange={setSelectedLeague}
      />

      <div className="flex-1 overflow-hidden flex flex-col w-full max-w-7xl mx-auto px-4">
        <div className="py-4 shrink-0">
          <StatsBar matches={matches} />
        </div>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-4 gap-6 pb-4">

          {/* Sidebar */}
          <aside className="lg:col-span-1 overflow-y-auto space-y-4 pr-1">
            <RiskFilter
              selectedRisk={selectedRisk}
              onRiskChange={setSelectedRisk}
              targetOdds={targetOdds}
              onTargetOddsChange={setTargetOdds}
            />

            {upcomingTopPicks.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-4">
                <h3 className="font-semibold text-foreground mb-3">Top Picks</h3>
                <div className="space-y-3">
                  {upcomingTopPicks.map(match => (
                    <button
                      key={match.id}
                      onClick={() => { setView('matches'); setSelectedMatch(match) }}
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
              </div>
            )}
          </aside>

          {/* Contenu principal */}
          <div className="lg:col-span-3 overflow-y-auto flex flex-col gap-4">

            {/* Toggles vue + filtre statut */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              {/* Vue : Matchs / Forme */}
              <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
                <button
                  onClick={() => setView('matches')}
                  className={cn(
                    'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                    view === 'matches'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Matchs
                </button>
                <button
                  onClick={() => setView('form')}
                  className={cn(
                    'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                    view === 'form'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Forme
                </button>
              </div>

              {/* Filtre statut + compteur */}
              {view === 'matches' && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
                    {statusButtons.map(btn => (
                      <button
                        key={btn.value}
                        onClick={() => setSelectedStatus(btn.value)}
                        className={cn(
                          'px-3 py-1 rounded-md text-xs font-medium transition-all',
                          selectedStatus === btn.value
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {filteredMatches.length} match{filteredMatches.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Contenu */}
            {isLoading ? (
              <div className="flex justify-center py-20">
                <p className="text-muted-foreground">Chargement...</p>
              </div>
            ) : view === 'matches' ? (
              <MatchList
                matches={filteredMatches}
                selectedLeague={selectedLeague}
                onMatchClick={setSelectedMatch}
              />
            ) : (
              <TeamFormView
                teams={teamForms}
                selectedLeague={selectedLeague}
              />
            )}
          </div>
        </div>
      </div>

      <MatchDetailModal
        match={selectedMatch}
        open={!!selectedMatch}
        onClose={() => setSelectedMatch(null)}
      />
    </div>
  )
}
