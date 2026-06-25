'use client'

import { useState, useEffect, use } from 'react'
import { notFound } from 'next/navigation'
import { MatchList } from '@/components/match-list'
import { PeriodSelector } from '@/components/period-selector'
import { MatchDetailModal } from '@/components/match-detail-modal'
import { Match, LEAGUES } from '@/lib/types'
import { getMatches, getTeamForms, getLatestMatchDate, Period, TeamForm } from '@/lib/api'
import { cn } from '@/lib/utils'

type View = 'matches' | 'form'

export default function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const league = LEAGUES.find(l => l.id === id)
  if (!league) notFound()

  const [matches, setMatches]         = useState<Match[]>([])
  const [forms, setForms]             = useState<TeamForm[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [view, setView]               = useState<View>('matches')
  const [period, setPeriod]           = useState<Period>('week')
  const [refDate, setRefDate]         = useState<Date | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)

  useEffect(() => {
    getLatestMatchDate().then(setRefDate)
  }, [])

  useEffect(() => {
    if (!refDate) return
    setIsLoading(true)
    if (view === 'matches') {
      getMatches(league.name, period, refDate).then(data => {
        setMatches(data)
        setIsLoading(false)
      })
    } else {
      getTeamForms(league.name).then(data => {
        setForms(data)
        setIsLoading(false)
      })
    }
  }, [league.name, period, refDate, view])

  function handlePeriodChange(p: Period, d: Date) {
    setPeriod(p)
    setRefDate(d)
  }

  return (
    <div className="flex flex-col bg-background min-h-screen">

      {/* En-tête championnat */}
      <div className="bg-card border-b border-border px-6 py-4 flex items-center gap-4">
        <span className="text-3xl">{league.flag}</span>
        <div>
          <h1 className="text-xl font-bold">{league.name}</h1>
          <p className="text-sm text-muted-foreground">{league.country}</p>
        </div>
      </div>

      <div className="flex-1 w-full max-w-7xl mx-auto px-4 flex flex-col">
        {/* Toggle vue */}
        <div className="flex items-center justify-between py-4 shrink-0">
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
            {(['matches', 'form'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                  view === v
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v === 'matches' ? 'Matchs' : 'Forme des équipes'}
              </button>
            ))}
          </div>
          {view === 'matches' && (
            <span className="text-sm text-muted-foreground">
              {isLoading ? '' : `${matches.length} match${matches.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {/* Sélecteur période (matchs uniquement) */}
        {view === 'matches' && (
          <div className="mb-4 shrink-0">
            {refDate && <PeriodSelector period={period} refDate={refDate} onChange={handlePeriodChange} />}
          </div>
        )}

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          ) : view === 'matches' ? (
            matches.length === 0 ? (
              <div className="flex flex-col items-center py-20 gap-2">
                <p className="text-muted-foreground">Aucun match sur cette période.</p>
                <button onClick={() => handlePeriodChange('month', refDate)} className="text-sm text-primary hover:underline">
                  Voir le mois complet
                </button>
              </div>
            ) : (
              <MatchList matches={matches} selectedLeague={id} onMatchClick={setSelectedMatch} />
            )
          ) : (
            <FormTable forms={forms} />
          )}
        </div>
      </div>

      <MatchDetailModal match={selectedMatch} open={!!selectedMatch} onClose={() => setSelectedMatch(null)} />
    </div>
  )
}

function FormTable({ forms }: { forms: TeamForm[] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Équipe</th>
            <th className="text-center px-4 py-3 font-medium text-muted-foreground">Forme (5 derniers)</th>
          </tr>
        </thead>
        <tbody>
          {forms.map(team => (
            <tr key={team.teamId} className="border-b border-border/50 last:border-0 hover:bg-secondary/20">
              <td className="px-4 py-3 font-medium">{team.name}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-center gap-1">
                  {team.form.split('').map((r, i) => (
                    <span key={i} className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                      r === 'W' ? 'bg-green-500/20 text-green-400' :
                      r === 'L' ? 'bg-red-500/20 text-red-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                    )}>
                      {r}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
