'use client'

import { LEAGUES, Match } from '@/lib/types'
import { getMatches } from '@/lib/api'
import { useState, useMemo, useEffect } from 'react'
import { BarChart3, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'

export default function ComparateurPage() {
  const [selectedLeague, setSelectedLeague] = useState('all')
  const [selectedMatch, setSelectedMatch]   = useState<Match | null>(null)
  const [imageError, setImageError]         = useState<Record<number, boolean>>({})
  const [matches, setMatches]               = useState<Match[]>([])
  const [isLoading, setIsLoading]           = useState(true)

  useEffect(() => {
    // Charger les matchs à venir du mois en cours
    getMatches(null, 'month', new Date()).then(data => {
      setMatches(data.filter(m => m.status === 'upcoming' || m.status === 'live'))
      setIsLoading(false)
    })
  }, [])

  const filteredMatches = useMemo(() => {
    if (selectedLeague === 'all') return matches
    const leagueName = LEAGUES.find(l => l.id === selectedLeague)?.name
    return matches.filter(m => m.league === leagueName)
  }, [selectedLeague, matches])

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

        {/* Filtre ligue */}
        <div className="flex gap-2 flex-wrap">
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Liste matchs */}
          <div className="lg:col-span-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col max-h-[700px]">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Sélectionner un match</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {filteredMatches.length} matchs à venir
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
                  Aucun match à venir sur cette période.
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
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(match.matchDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                        {selectedMatch?.id === match.id && <Check className="h-4 w-4 text-primary" />}
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
          <div className="lg:col-span-2">
            {selectedMatch ? (
              <div className="space-y-6">
                {/* En-tête match sélectionné */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-muted-foreground">{selectedMatch.league}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(selectedMatch.matchDate).toLocaleDateString('fr-FR', {
                        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <MatchTeam team={selectedMatch.homeTeam} imageError={imageError} onError={setImageError} />
                    <span className="text-xl font-bold text-muted-foreground px-6">VS</span>
                    <MatchTeam team={selectedMatch.awayTeam} imageError={imageError} onError={setImageError} align="right" />
                  </div>
                </div>

                {/* Message cotes non disponibles */}
                <div className="bg-card rounded-xl border border-border p-8 flex flex-col items-center gap-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Cotes non disponibles</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      La comparaison de cotes nécessite une intégration avec un agrégateur de bookmakers
                      (ex. OddsAPI, BetExplorer). Cette fonctionnalité sera disponible dans une prochaine version.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border p-12 text-center h-full flex flex-col items-center justify-center gap-4">
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

function TeamRow({
  team, imageError, onError,
}: {
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

function MatchTeam({
  team, imageError, onError, align = 'left',
}: {
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
