'use client'

import Image from 'next/image'
import { useState } from 'react'
import { TeamForm } from '@/lib/api'
import { LEAGUES } from '@/lib/types'
import { cn } from '@/lib/utils'

interface TeamFormViewProps {
  teams: TeamForm[]
  selectedLeague: string
}

function formScore(form: string): number {
  return form.split('').reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
}

function FormBadge({ result }: { result: string }) {
  return (
    <span className={cn(
      'w-6 h-6 flex items-center justify-center text-[10px] font-bold rounded text-white',
      result === 'W' && 'bg-[var(--win)]',
      result === 'D' && 'bg-[var(--draw)]',
      result === 'L' && 'bg-[var(--loss)]',
    )}>
      {result}
    </span>
  )
}

function TeamRow({ team }: { team: TeamForm }) {
  const [imgError, setImgError] = useState(false)
  const results = team.form.split('')
  const wins   = results.filter(r => r === 'W').length
  const draws  = results.filter(r => r === 'D').length
  const losses = results.filter(r => r === 'L').length

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      {/* Logo */}
      <div className="relative h-7 w-7 shrink-0">
        {!imgError && team.logoUrl ? (
          <Image src={team.logoUrl} alt={team.name} fill className="object-contain"
            onError={() => setImgError(true)} />
        ) : (
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xs font-bold text-muted-foreground">
              {team.shortName.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Nom */}
      <span className="flex-1 text-sm font-medium text-foreground truncate">{team.name}</span>

      {/* Badges W/D/L */}
      <div className="flex items-center gap-0.5">
        {results.map((r, i) => <FormBadge key={i} result={r} />)}
      </div>

      {/* Mini-bilan */}
      <div className="hidden sm:flex items-center gap-1 text-[11px] font-medium min-w-[72px] justify-end">
        <span className="text-[var(--win)]">{wins}V</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="text-[var(--draw)]">{draws}N</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="text-[var(--loss)]">{losses}D</span>
      </div>
    </div>
  )
}

function LeagueSection({ leagueName, teams }: { leagueName: string; teams: TeamForm[] }) {
  const league = LEAGUES.find(l => l.name === leagueName)
  const sorted = [...teams].sort((a, b) => formScore(b.form) - formScore(a.form))

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
        <span className="text-lg">{league?.flag ?? '🌍'}</span>
        <h3 className="font-semibold text-foreground text-sm">{leagueName}</h3>
        <span className="ml-auto text-xs text-muted-foreground">{sorted.length} équipes</span>
      </div>
      <div className="px-4">
        {sorted.map(team => <TeamRow key={team.teamId} team={team} />)}
      </div>
    </div>
  )
}

export function TeamFormView({ teams, selectedLeague }: TeamFormViewProps) {
  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">Aucune donnée de forme disponible.</p>
        <p className="text-xs mt-1">Lance <code className="text-primary">python fetch_form.py</code> pour les calculer.</p>
      </div>
    )
  }

  // Filtrer par ligue si sélectionnée
  const filtered = selectedLeague === 'all'
    ? teams
    : teams.filter(t => {
        const leagueName = LEAGUES.find(l => l.id === selectedLeague)?.name
        return t.league === leagueName
      })

  // Grouper par ligue
  const byLeague = filtered.reduce<Record<string, TeamForm[]>>((acc, team) => {
    if (!acc[team.league]) acc[team.league] = []
    acc[team.league].push(team)
    return acc
  }, {})

  // Ordre des ligues selon LEAGUES
  const leagueOrder = LEAGUES.map(l => l.name)
  const sortedLeagues = Object.keys(byLeague).sort(
    (a, b) => leagueOrder.indexOf(a) - leagueOrder.indexOf(b)
  )

  return (
    <div className="space-y-4">
      {sortedLeagues.map(league => (
        <LeagueSection key={league} leagueName={league} teams={byLeague[league]} />
      ))}
    </div>
  )
}
