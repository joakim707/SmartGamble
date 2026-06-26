'use client'

import { LEAGUES, Match, MatchOdds } from '@/lib/types'
import { useState, useMemo, useEffect } from 'react'
import { BarChart3, Check, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

// Match enrichi avec cotes bookmakers
interface MatchWithOdds extends Match {
  odds?: MatchOdds
}

async function getAllMatchesWithOdds(): Promise<MatchWithOdds[]> {
  // 1. Récupérer tous les matchs (terminés + à venir) depuis football-data.org
  const { data: matchesData, error } = await supabase
    .from('match')
    .select(`
      id, match_date, status, league, score_home, score_away,
      home_team:home_team_id(id, name, short_name, logo_url),
      away_team:away_team_id(id, name, short_name, logo_url)
    `)
    .not('fd_match_id', 'is', null)
    .in('league', ['Ligue 1', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A'])
    .in('status', ['finished', 'upcoming', 'live'])
    .order('match_date', { ascending: false })
    .limit(500)

  if (error || !matchesData) return []

  // 2. Récupérer toutes les cotes disponibles
  const matchIds = matchesData.map((m: any) => m.id)
  const { data: oddsData } = await supabase
    .from('odds')
    .select('match_id, bookmaker, odds_home, odds_draw, odds_away')
    .in('match_id', matchIds)

  // 3. Construire un index match_id → cotes agrégées par bookmaker
  const oddsMap = new Map<number, { homes: number[]; draws: number[]; aways: number[]; bookmakers: MatchOdds['bookmakers'] }>()
  for (const odd of oddsData ?? []) {
    if (!oddsMap.has(odd.match_id)) {
      oddsMap.set(odd.match_id, { homes: [], draws: [], aways: [], bookmakers: [] })
    }
    const o = oddsMap.get(odd.match_id)!
    if (odd.odds_home) o.homes.push(odd.odds_home)
    if (odd.odds_draw) o.draws.push(odd.odds_draw)
    if (odd.odds_away) o.aways.push(odd.odds_away)
    if (odd.bookmaker) {
      o.bookmakers.push({ name: odd.bookmaker, home: odd.odds_home, draw: odd.odds_draw, away: odd.odds_away })
    }
  }

  return matchesData.map((m: any): MatchWithOdds => {
    const mo = oddsMap.get(m.id)
    const odds: MatchOdds | undefined = mo && mo.bookmakers.length > 0 ? {
      home: mo.homes.reduce((a, b) => a + b, 0) / mo.homes.length,
      draw: mo.draws.reduce((a, b) => a + b, 0) / mo.draws.length,
      away: mo.aways.reduce((a, b) => a + b, 0) / mo.aways.length,
      bookmakers: mo.bookmakers,
    } : undefined

    return {
      id:        m.id,
      league:    m.league,
      matchDate: m.match_date,
      status:    m.status,
      scoreHome: m.score_home ?? undefined,
      scoreAway: m.score_away ?? undefined,
      homeTeam: {
        id:        m.home_team.id,
        name:      m.home_team.name,
        shortName: m.home_team.short_name || m.home_team.name.substring(0, 3).toUpperCase(),
        logoUrl:   m.home_team.logo_url || '',
        league:    m.league,
      },
      awayTeam: {
        id:        m.away_team.id,
        name:      m.away_team.name,
        shortName: m.away_team.short_name || m.away_team.name.substring(0, 3).toUpperCase(),
        logoUrl:   m.away_team.logo_url || '',
        league:    m.league,
      },
      odds,
    }
  })
}

export default function ComparateurPage() {
  const [selectedLeague, setSelectedLeague] = useState('all')
  const [selectedMatch, setSelectedMatch]   = useState<MatchWithOdds | null>(null)
  const [imageError, setImageError]         = useState<Record<number, boolean>>({})
  const [matches, setMatches]               = useState<MatchWithOdds[]>([])
  const [isLoading, setIsLoading]           = useState(true)
  const [onlyWithOdds, setOnlyWithOdds]     = useState(false)

  useEffect(() => {
    getAllMatchesWithOdds().then(data => {
      setMatches(data)
      setIsLoading(false)
    })
  }, [])

  const filteredMatches = useMemo(() => {
    let list = matches
    if (selectedLeague !== 'all') {
      const leagueName = LEAGUES.find(l => l.id === selectedLeague)?.name
      list = list.filter(m => m.league === leagueName)
    }
    if (onlyWithOdds) {
      list = list.filter(m => m.odds && m.odds.bookmakers.length > 0)
    }
    return list
  }, [selectedLeague, matches, onlyWithOdds])

  const getBestOdds = (match: MatchWithOdds) => {
    if (!match.odds?.bookmakers?.length) return null
    const best = {
      home: { value: 0, bookmaker: '' },
      draw: { value: 0, bookmaker: '' },
      away: { value: 0, bookmaker: '' },
    }
    for (const bk of match.odds.bookmakers) {
      if (bk.home > best.home.value) best.home = { value: bk.home, bookmaker: bk.name }
      if (bk.draw > best.draw.value) best.draw = { value: bk.draw, bookmaker: bk.name }
      if (bk.away > best.away.value) best.away = { value: bk.away, bookmaker: bk.name }
    }
    return best
  }

  return (
    <div className="flex flex-col bg-background min-h-screen">
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* En-tête */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Comparateur de cotes</h1>
            <p className="text-muted-foreground">Trouvez les meilleures cotes parmi tous les bookmakers</p>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedLeague('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
              selectedLeague === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            )}
          >
            Tous
          </button>
          {LEAGUES.map(l => (
            <button
              key={l.id}
              onClick={() => setSelectedLeague(l.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                selectedLeague === l.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {l.flag} {l.name}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyWithOdds}
              onChange={e => setOnlyWithOdds(e.target.checked)}
              className="rounded"
            />
            Avec cotes uniquement
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Liste matchs */}
          <div className="lg:col-span-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col max-h-[700px]">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Sélectionner un match</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isLoading ? '…' : `${filteredMatches.length} matchs`}
                {' · '}
                {isLoading ? '' : `${filteredMatches.filter(m => m.odds).length} avec cotes`}
              </p>
            </div>

            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
                  Chargement...
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Aucun match disponible.
                </div>
              ) : (
                filteredMatches.map(match => (
                  <button
                    key={match.id}
                    onClick={() => setSelectedMatch(match)}
                    className={cn(
                      'w-full text-left p-4 border-b border-border/50 hover:bg-secondary/50 transition-colors',
                      selectedMatch?.id === match.id && 'bg-primary/10 border-l-2 border-l-primary'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{match.league}</span>
                      <div className="flex items-center gap-2">
                        {match.odds && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">
                            Cotes
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(match.matchDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                        {selectedMatch?.id === match.id && <Check className="h-3 w-3 text-primary" />}
                      </div>
                    </div>
                    <TeamRow team={match.homeTeam} imageError={imageError} onError={setImageError} />
                    <TeamRow team={match.awayTeam} imageError={imageError} onError={setImageError} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Panneau droite */}
          <div className="lg:col-span-2 space-y-6">
            {selectedMatch ? (
              <>
                {/* En-tête match */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-muted-foreground">{selectedMatch.league}</span>
                    <div className="flex items-center gap-3">
                      {selectedMatch.status === 'finished' && selectedMatch.scoreHome !== undefined && (
                        <span className="text-sm font-bold text-foreground">
                          {selectedMatch.scoreHome} – {selectedMatch.scoreAway}
                        </span>
                      )}
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        selectedMatch.status === 'finished' ? 'bg-muted text-muted-foreground' :
                        selectedMatch.status === 'live'     ? 'bg-red-500/20 text-red-400 animate-pulse' :
                                                              'bg-primary/10 text-primary'
                      )}>
                        {selectedMatch.status === 'finished' ? 'Terminé' :
                         selectedMatch.status === 'live'     ? 'LIVE' : 'À venir'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <MatchTeam team={selectedMatch.homeTeam} imageError={imageError} onError={setImageError} />
                    <span className="text-xl font-bold text-muted-foreground px-6">VS</span>
                    <MatchTeam team={selectedMatch.awayTeam} imageError={imageError} onError={setImageError} align="right" />
                  </div>
                </div>

                {selectedMatch.odds?.bookmakers?.length ? (
                  <>
                    {/* Meilleures cotes */}
                    <div className="grid grid-cols-3 gap-4">
                      {(['home', 'draw', 'away'] as const).map(type => {
                        const best   = getBestOdds(selectedMatch)![type]
                        const labels = { home: '1 Domicile', draw: 'X Nul', away: '2 Extérieur' }
                        return (
                          <div key={type} className="bg-card rounded-xl border border-primary/30 p-4 text-center">
                            <div className="text-xs text-muted-foreground mb-1">{labels[type]}</div>
                            <div className="text-2xl font-bold text-primary">{best.value.toFixed(2)}</div>
                            <div className="flex items-center justify-center gap-1 mt-1 text-xs text-green-400">
                              <ArrowUpRight className="h-3 w-3" />
                              <span>{best.bookmaker}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Tableau comparatif */}
                    <div className="bg-card rounded-xl border border-border overflow-hidden">
                      <div className="p-4 border-b border-border">
                        <h3 className="font-semibold text-foreground">Comparaison complète</h3>
                        <p className="text-xs text-muted-foreground">Les meilleures cotes sont en vert</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border bg-secondary/30">
                              <th className="text-left p-4 text-sm font-medium text-muted-foreground">Bookmaker</th>
                              <th className="text-center p-4 text-sm font-medium text-muted-foreground">1 Dom</th>
                              <th className="text-center p-4 text-sm font-medium text-muted-foreground">X Nul</th>
                              <th className="text-center p-4 text-sm font-medium text-muted-foreground">2 Ext</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedMatch.odds.bookmakers.map(bk => {
                              const best = getBestOdds(selectedMatch)!
                              return (
                                <tr key={bk.name} className="border-b border-border/50 hover:bg-secondary/20">
                                  <td className="p-4 font-medium text-foreground">{bk.name}</td>
                                  {(['home', 'draw', 'away'] as const).map(t => (
                                    <td key={t} className="p-4 text-center">
                                      <span className={cn(
                                        'px-3 py-1.5 rounded text-sm font-bold',
                                        best[t].value === bk[t]
                                          ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30'
                                          : 'bg-secondary text-foreground'
                                      )}>
                                        {bk[t].toFixed(2)}
                                      </span>
                                    </td>
                                  ))}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Moyennes */}
                    <div className="bg-card rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Cotes moyennes :</span>
                        <div className="flex items-center gap-4">
                          <span>1 : <strong>{selectedMatch.odds.home.toFixed(2)}</strong></span>
                          <span>X : <strong>{selectedMatch.odds.draw.toFixed(2)}</strong></span>
                          <span>2 : <strong>{selectedMatch.odds.away.toFixed(2)}</strong></span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
                    Aucune cote disponible pour ce match.
                  </div>
                )}
              </>
            ) : (
              <div className="bg-card rounded-xl border border-border p-12 text-center flex flex-col items-center justify-center gap-4">
                <BarChart3 className="h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">Sélectionnez un match</h3>
                <p className="text-muted-foreground">
                  Choisissez un match dans la liste pour comparer les cotes des différents bookmakers
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamRow({ team, imageError, onError }: {
  team: Match['homeTeam']
  imageError: Record<number, boolean>
  onError: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
}) {
  return (
    <div className="flex items-center gap-2 mb-1 last:mb-0">
      <div className="relative h-5 w-5 shrink-0">
        {!imageError[team.id] && team.logoUrl ? (
          <Image src={team.logoUrl} alt={team.name} fill className="object-contain"
            onError={() => onError(p => ({ ...p, [team.id]: true }))} />
        ) : (
          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
            <span className="text-[8px] font-bold text-muted-foreground">{team.name.charAt(0)}</span>
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-foreground truncate">{team.name}</span>
    </div>
  )
}

function MatchTeam({ team, imageError, onError, align = 'left' }: {
  team: Match['homeTeam']
  imageError: Record<number, boolean>
  onError: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('flex items-center gap-3 flex-1', align === 'right' && 'justify-end flex-row-reverse')}>
      <div className="relative h-12 w-12 shrink-0">
        {!imageError[team.id] && team.logoUrl ? (
          <Image src={team.logoUrl} alt={team.name} fill className="object-contain"
            onError={() => onError(p => ({ ...p, [team.id]: true }))} />
        ) : (
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <span className="text-lg font-bold text-muted-foreground">{team.name.charAt(0)}</span>
          </div>
        )}
      </div>
      <span className="font-semibold text-foreground">{team.name}</span>
    </div>
  )
}
