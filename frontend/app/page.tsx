'use client'

import { useState, useEffect } from 'react'
import { MatchList } from '@/components/match-list'
import { StatsBar } from '@/components/stats-bar'
import { MatchDetailModal } from '@/components/match-detail-modal'
import { PeriodSelector } from '@/components/period-selector'
import { Match, LEAGUES } from '@/lib/types'
import { getMatches, getLatestMatchDate, Period } from '@/lib/api'

export default function HomePage() {
  const [matches, setMatches]           = useState<Match[]>([])
  const [isLoading, setIsLoading]       = useState(true)
  const [selectedLeague, setSelectedLeague] = useState('all')
  const [selectedMatch, setSelectedMatch]   = useState<Match | null>(null)
  const [period, setPeriod]   = useState<Period>('week')
  const [refDate, setRefDate] = useState<Date | null>(null)

  const leagueName = LEAGUES.find(l => l.id === selectedLeague)?.name ?? null

  // Initialiser sur la dernière date disponible en BDD
  useEffect(() => {
    getLatestMatchDate().then(setRefDate)
  }, [])

  useEffect(() => {
    if (!refDate) return
    setIsLoading(true)
    getMatches(leagueName, period, refDate).then(data => {
      setMatches(data)
      setIsLoading(false)
    })
  }, [leagueName, period, refDate])

  function handlePeriodChange(p: Period, d: Date) {
    setPeriod(p)
    setRefDate(d)
  }

  function handleLeagueChange(id: string) {
    setSelectedLeague(id)
  }

  return (
    <div className="flex flex-col bg-background min-h-screen">

      <div className="flex-1 w-full max-w-7xl mx-auto px-4 flex flex-col">
        <div className="py-4 shrink-0">
          <StatsBar matches={matches} />
        </div>

        {/* Sélecteur de période */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          {refDate && <PeriodSelector period={period} refDate={refDate} onChange={handlePeriodChange} />}
          <span className="text-sm text-muted-foreground">
            {isLoading ? 'Chargement...' : `${matches.length} match${matches.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Liste des matchs */}
        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-2">
              <p className="text-muted-foreground">Aucun match sur cette période.</p>
              <button
                onClick={() => handlePeriodChange('month', refDate)}
                className="text-sm text-primary hover:underline"
              >
                Voir le mois complet
              </button>
            </div>
          ) : (
            <MatchList matches={matches} selectedLeague={selectedLeague} onMatchClick={setSelectedMatch} />
          )}
        </div>
      </div>

      <MatchDetailModal match={selectedMatch} open={!!selectedMatch} onClose={() => setSelectedMatch(null)} />
    </div>
  )
}
