'use client'

import { LEAGUES, Match } from '@/lib/types'
import { getUpcomingMatches } from '@/lib/api'
import { useState, useMemo, useEffect } from 'react'
import { BarChart3, Check, Trophy, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'

export default function ComparateurPage() {
  const [selectedLeague, setSelectedLeague] = useState('all')
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [imageError, setImageError] = useState<Record<number, boolean>>({})

  //États pour gérer les matchs et le chargement
  const [matches, setMatches] = useState<Match[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Récupérer vrais matchs depuis Supabase
  useEffect(() => {
    async function loadMatches() {
      const data = await getUpcomingMatches()
      setMatches(data)
      setIsLoading(false)
    }
    loadMatches()
  }, [])

  const filteredMatches = useMemo(() => {
    
    if (selectedLeague === 'all') return matches.filter(m => m.odds?.bookmakers && m.odds.bookmakers.length > 0)
    const leagueName = LEAGUES.find(l => l.id === selectedLeague)?.name
    return matches.filter(m => m.league === leagueName && m.odds?.bookmakers && m.odds.bookmakers.length > 0)
  }, [selectedLeague, matches])

  const handleImageError = (teamId: number) => {
    setImageError(prev => ({ ...prev, [teamId]: true }))
  }

  // Get best odds for a match
  const getBestOdds = (match: Match) => {
    if (!match.odds?.bookmakers || match.odds.bookmakers.length === 0) return null
    
    const best = {
      home: { value: 0, bookmaker: '' },
      draw: { value: 0, bookmaker: '' },
      away: { value: 0, bookmaker: '' },
    }

    match.odds.bookmakers.forEach(bk => {
      if (bk.home > best.home.value) {
        best.home = { value: bk.home, bookmaker: bk.name }
      }
      if (bk.draw > best.draw.value) {
        best.draw = { value: bk.draw, bookmaker: bk.name }
      }
      if (bk.away > best.away.value) {
        best.away = { value: bk.away, bookmaker: bk.name }
      }
    })

    return best
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LeagueSelector 
        selectedLeague={selectedLeague} 
        onLeagueChange={setSelectedLeague} 
      />

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Comparateur de cotes</h1>
            <p className="text-muted-foreground">
              Trouvez les meilleures cotes parmi tous les bookmakers
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Match List */}
          <div className="lg:col-span-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col max-h-[700px]">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Sélectionner un match</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {filteredMatches.length} matchs avec cotes disponibles
              </p>
            </div>
            
            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary"></div>
                  Chargement des cotes...
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Aucun match avec des cotes disponibles pour le moment.
                </div>
              ) : (
                filteredMatches.map((match) => (
                  <button
                    key={match.id}
                    onClick={() => setSelectedMatch(match)}
                    className={cn(
                      "w-full text-left p-4 border-b border-border/50 hover:bg-secondary/50 transition-colors",
                      selectedMatch?.id === match.id && "bg-primary/10 border-l-2 border-l-primary"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{match.league}</span>
                      {selectedMatch?.id === match.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="relative h-5 w-5 flex-shrink-0">
                        {!imageError[match.homeTeam.id] ? (
                          <Image
                            src={match.homeTeam.logoUrl}
                            alt={match.homeTeam.name}
                            fill
                            className="object-contain"
                            onError={() => handleImageError(match.homeTeam.id)}
                          />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-[8px] font-bold text-muted-foreground">
                              {match.homeTeam.shortName.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="font-medium text-foreground text-sm truncate">
                        {match.homeTeam.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative h-5 w-5 flex-shrink-0">
                        {!imageError[match.awayTeam.id] ? (
                          <Image
                            src={match.awayTeam.logoUrl}
                            alt={match.awayTeam.name}
                            fill
                            className="object-contain"
                            onError={() => handleImageError(match.awayTeam.id)}
                          />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-[8px] font-bold text-muted-foreground">
                              {match.awayTeam.shortName.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="font-medium text-foreground text-sm truncate">
                        {match.awayTeam.name}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Odds Comparison */}
          <div className="lg:col-span-2 space-y-6">
            {selectedMatch ? (
              <>
                {/* Selected Match Header */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-muted-foreground">{selectedMatch.league}</span>
                    <div className="flex items-center gap-1 text-xs text-primary">
                      <Trophy className="h-3 w-3" />
                      <span>Confiance: {selectedMatch.confidenceScore}%</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="relative h-12 w-12">
                        {!imageError[selectedMatch.homeTeam.id] ? (
                          <Image
                            src={selectedMatch.homeTeam.logoUrl}
                            alt={selectedMatch.homeTeam.name}
                            fill
                            className="object-contain"
                            onError={() => handleImageError(selectedMatch.homeTeam.id)}
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-lg font-bold text-muted-foreground">
                              {selectedMatch.homeTeam.shortName.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="font-semibold text-foreground">{selectedMatch.homeTeam.name}</span>
                    </div>
                    
                    <span className="text-xl font-bold text-muted-foreground px-6">VS</span>
                    
                    <div className="flex items-center gap-3 flex-1 justify-end">
                      <span className="font-semibold text-foreground">{selectedMatch.awayTeam.name}</span>
                      <div className="relative h-12 w-12">
                        {!imageError[selectedMatch.awayTeam.id] ? (
                          <Image
                            src={selectedMatch.awayTeam.logoUrl}
                            alt={selectedMatch.awayTeam.name}
                            fill
                            className="object-contain"
                            onError={() => handleImageError(selectedMatch.awayTeam.id)}
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-lg font-bold text-muted-foreground">
                              {selectedMatch.awayTeam.shortName.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Best Odds Summary */}
                {getBestOdds(selectedMatch) && (
                  <div className="grid grid-cols-3 gap-4">
                    {(['home', 'draw', 'away'] as const).map((type) => {
                      const best = getBestOdds(selectedMatch)![type]
                      const labels = { home: '1 (Domicile)', draw: 'X (Nul)', away: '2 (Extérieur)' }
                      
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
                )}

                {/* Full Comparison Table */}
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold text-foreground">Comparaison complète</h3>
                    <p className="text-xs text-muted-foreground">
                      Les meilleures cotes sont mises en évidence en vert
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-secondary/30">
                          <th className="text-left p-4 text-sm font-medium text-muted-foreground">Bookmaker</th>
                          <th className="text-center p-4 text-sm font-medium text-muted-foreground">1 (Dom)</th>
                          <th className="text-center p-4 text-sm font-medium text-muted-foreground">X (Nul)</th>
                          <th className="text-center p-4 text-sm font-medium text-muted-foreground">2 (Ext)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMatch.odds?.bookmakers.map((bk) => {
                          const best = getBestOdds(selectedMatch)
                          return (
                            <tr key={bk.name} className="border-b border-border/50 hover:bg-secondary/20">
                              <td className="p-4">
                                <span className="font-medium text-foreground">{bk.name}</span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={cn(
                                  "px-3 py-1.5 rounded text-sm font-bold",
                                  best?.home.value === bk.home 
                                    ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/30"
                                    : "bg-[var(--odds-bg)] text-foreground"
                                )}>
                                  {bk.home.toFixed(2)}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={cn(
                                  "px-3 py-1.5 rounded text-sm font-bold",
                                  best?.draw.value === bk.draw 
                                    ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/30"
                                    : "bg-[var(--odds-bg)] text-foreground"
                                )}>
                                  {bk.draw.toFixed(2)}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={cn(
                                  "px-3 py-1.5 rounded text-sm font-bold",
                                  best?.away.value === bk.away 
                                    ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/30"
                                    : "bg-[var(--odds-bg)] text-foreground"
                                )}>
                                  {bk.away.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Odds Average */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cotes moyennes:</span>
                    <div className="flex items-center gap-4">
                      <span className="text-foreground">
                        1: <strong>{selectedMatch.odds?.home.toFixed(2)}</strong>
                      </span>
                      <span className="text-foreground">
                        X: <strong>{selectedMatch.odds?.draw.toFixed(2)}</strong>
                      </span>
                      <span className="text-foreground">
                        2: <strong>{selectedMatch.odds?.away.toFixed(2)}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-card rounded-xl border border-border p-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Sélectionnez un match
                </h3>
                <p className="text-muted-foreground">
                  Choisissez un match dans la liste pour comparer les cotes des différents bookmakers
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}