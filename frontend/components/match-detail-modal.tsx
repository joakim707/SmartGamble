'use client'

import { Match } from '@/lib/types'
import { LineupPlayer, KeyPlayer } from '@/lib/lineup'
import { getConfidenceLabel, formatMatchDate, formatMatchTime } from '@/lib/mock-data'
import { getProbableLineup, getKeyPlayers, getAbsentImpact, DEFAULT_SEASON } from '@/lib/lineup'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Calendar,
  Clock,
  TrendingUp,
  BarChart3,
  Users,
  UserX,
  Star,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { useState, useEffect } from 'react'

interface MatchDetailModalProps {
  match: Match | null
  open: boolean
  onClose: () => void
}

const POSITION_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']
const POSITION_LABEL: Record<string, string> = {
  Goalkeeper: 'Gardiens',
  Defender: 'Défenseurs',
  Midfielder: 'Milieux',
  Forward: 'Attaquants',
}

function groupByPosition(players: LineupPlayer[]): Record<string, LineupPlayer[]> {
  const groups: Record<string, LineupPlayer[]> = {}
  for (const p of players) {
    const pos = p.position || 'Autre'
    if (!groups[pos]) groups[pos] = []
    groups[pos].push(p)
  }
  return groups
}

export function MatchDetailModal({ match, open, onClose }: MatchDetailModalProps) {
  const [imageError, setImageError] = useState<Record<number, boolean>>({})
  const [homePlayers, setHomePlayers]         = useState<LineupPlayer[]>([])
  const [awayPlayers, setAwayPlayers]         = useState<LineupPlayer[]>([])
  const [homeKeyPlayers, setHomeKeyPlayers]   = useState<KeyPlayer[]>([])
  const [awayKeyPlayers, setAwayKeyPlayers]   = useState<KeyPlayer[]>([])
  const [homeAbsents, setHomeAbsents]         = useState<KeyPlayer[]>([])
  const [awayAbsents, setAwayAbsents]         = useState<KeyPlayer[]>([])
  const [lineupLoading, setLineupLoading]     = useState(false)

  useEffect(() => {
    if (!open || !match) return
    setLineupLoading(true)
    Promise.all([
      // Compositions réelles depuis SofaScore (ou algo maison en fallback)
      getProbableLineup(match.id, match.homeTeam.id, DEFAULT_SEASON),
      getProbableLineup(match.id, match.awayTeam.id, DEFAULT_SEASON),
      // Top 3 joueurs clés par équipe (calculé via l'algo de scoring)
      getKeyPlayers(match.homeTeam.id, DEFAULT_SEASON),
      getKeyPlayers(match.awayTeam.id, DEFAULT_SEASON),
      // Absents pour CE match avec évaluation d'impact
      getAbsentImpact(match.id, match.homeTeam.id, DEFAULT_SEASON),
      getAbsentImpact(match.id, match.awayTeam.id, DEFAULT_SEASON),
    ]).then(([home, away, homeKeys, awayKeys, homeAbs, awayAbs]) => {
      setHomePlayers(home)
      setAwayPlayers(away)
      setHomeKeyPlayers(homeKeys)
      setAwayKeyPlayers(awayKeys)
      setHomeAbsents(homeAbs)
      setAwayAbsents(awayAbs)
      setLineupLoading(false)
    })
  }, [open, match])

  if (!match) return null

  const confidence = match.confidenceScore ? getConfidenceLabel(match.confidenceScore) : null
  const bookmakers = match.odds?.bookmakers || []
  const hasLineup  = homePlayers.length > 0 || awayPlayers.length > 0
  const hasStats   = homePlayers.some(p => p.score > 0) || awayPlayers.some(p => p.score > 0)

  const handleImageError = (teamId: number) => {
    setImageError(prev => ({ ...prev, [teamId]: true }))
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Détail du match
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto p-6 space-y-6">
          {/* Match Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">{formatMatchDate(match.matchDate)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{formatMatchTime(match.matchDate)}</span>
            </div>
          </div>

          {/* Teams */}
          <div className="flex items-center justify-between gap-4 py-6">
            {/* Home Team */}
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="relative h-16 w-16 mb-3">
                {!imageError[match.homeTeam.id] ? (
                  <Image
                    src={match.homeTeam.logoUrl}
                    alt={match.homeTeam.name}
                    fill
                    className="object-contain"
                    onError={() => handleImageError(match.homeTeam.id)}
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-xl font-bold text-muted-foreground">
                      {match.homeTeam.shortName.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-foreground">{match.homeTeam.name}</h3>
              <span className="text-xs text-muted-foreground">Domicile</span>
              {match.homeForm && <FormDisplay form={match.homeForm} />}
            </div>

            {/* VS */}
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-muted-foreground">VS</span>
            </div>

            {/* Away Team */}
            <div className="flex-1 flex flex-col items-center text-center">
              <div className="relative h-16 w-16 mb-3">
                {!imageError[match.awayTeam.id] ? (
                  <Image
                    src={match.awayTeam.logoUrl}
                    alt={match.awayTeam.name}
                    fill
                    className="object-contain"
                    onError={() => handleImageError(match.awayTeam.id)}
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-xl font-bold text-muted-foreground">
                      {match.awayTeam.shortName.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-foreground">{match.awayTeam.name}</h3>
              <span className="text-xs text-muted-foreground">Extérieur</span>
              {match.awayForm && <FormDisplay form={match.awayForm} />}
            </div>
          </div>

          {/* Confidence Score */}
          {confidence && (
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className={cn("h-5 w-5", confidence.color)} />
                  <span className="font-medium text-foreground">Indice de confiance</span>
                </div>
                <div className="text-right">
                  <span className={cn("text-2xl font-bold", confidence.color)}>
                    {match.confidenceScore}%
                  </span>
                  <p className="text-xs text-muted-foreground">{confidence.label}</p>
                </div>
              </div>
              <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full transition-all", 
                    match.confidenceScore! >= 80 ? "bg-green-500" :
                    match.confidenceScore! >= 65 ? "bg-emerald-500" :
                    match.confidenceScore! >= 50 ? "bg-yellow-500" : "bg-red-500"
                  )}
                  style={{ width: `${match.confidenceScore}%` }}
                />
              </div>
            </div>
          )}

          {/* Odds Comparison */}
          {bookmakers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-foreground">Comparaison des cotes</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-sm font-medium text-muted-foreground">Bookmaker</th>
                      <th className="text-center py-2 text-sm font-medium text-muted-foreground">1</th>
                      <th className="text-center py-2 text-sm font-medium text-muted-foreground">X</th>
                      <th className="text-center py-2 text-sm font-medium text-muted-foreground">2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookmakers.map((bk) => (
                      <tr key={bk.name} className="border-b border-border/50">
                        <td className="py-3 text-sm font-medium text-foreground">{bk.name}</td>
                        <td className="py-3 text-center">
                          <span className="px-3 py-1 bg-[var(--odds-bg)] rounded text-sm font-bold text-foreground">
                            {bk.home.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <span className="px-3 py-1 bg-[var(--odds-bg)] rounded text-sm font-bold text-foreground">
                            {bk.draw.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <span className="px-3 py-1 bg-[var(--odds-bg)] rounded text-sm font-bold text-foreground">
                            {bk.away.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Joueurs clés */}
          {(homeKeyPlayers.length > 0 || awayKeyPlayers.length > 0) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-yellow-500" />
                <h4 className="font-semibold text-foreground">Joueurs clés</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <KeyPlayersColumn teamName={match.homeTeam.shortName} players={homeKeyPlayers} />
                <KeyPlayersColumn teamName={match.awayTeam.shortName} players={awayKeyPlayers} />
              </div>
            </div>
          )}

          {/* Compositions probables */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-foreground">Compositions probables</h4>
            </div>

            {lineupLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>
            ) : !hasLineup ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Aucune composition disponible pour ce match
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <LineupColumn
                  teamName={match.homeTeam.shortName}
                  players={homePlayers}
                  hasStats={hasStats}
                />
                <LineupColumn
                  teamName={match.awayTeam.shortName}
                  players={awayPlayers}
                  hasStats={hasStats}
                />
              </div>
            )}
          </div>

          {/* Absents avec indicateur d'impact */}
          {(homeAbsents.length > 0 || awayAbsents.length > 0) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <UserX className="h-4 w-4 text-destructive" />
                <h4 className="font-semibold text-foreground">Absents</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <AbsentsColumn teamName={match.homeTeam.shortName} players={homeAbsents} />
                <AbsentsColumn teamName={match.awayTeam.shortName} players={awayAbsents} />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Fermer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface LineupColumnProps {
  teamName: string
  players: LineupPlayer[]
  hasStats: boolean
}

function LineupColumn({ teamName, players, hasStats }: LineupColumnProps) {
  const groups = groupByPosition(players)
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {teamName}
      </p>
      <div className="space-y-3">
        {POSITION_ORDER.filter(pos => groups[pos]?.length).map(pos => (
          <div key={pos}>
            <p className="text-[10px] font-bold text-primary/80 uppercase tracking-widest mb-1 border-b border-border/40 pb-0.5">
              {POSITION_LABEL[pos]}
            </p>
            <ul className="space-y-1">
              {groups[pos].map(p => (
                <li key={p.id} className="flex items-center gap-2 text-sm text-foreground">
                  {p.shirtNumber !== null && (
                    <span className="text-[10px] font-bold text-muted-foreground w-4 text-right shrink-0">
                      {p.shirtNumber}
                    </span>
                  )}
                  <span className="truncate flex-1">{p.name}</span>
                  {hasStats && p.score > 0 && (
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {p.score.toFixed(1)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups['Autre']?.length ? (
          <div>
            <p className="text-[10px] font-bold text-primary/80 uppercase tracking-widest mb-1 border-b border-border/40 pb-0.5">Autres</p>
            <ul className="space-y-1">
              {groups['Autre'].map(p => (
                <li key={p.id} className="text-sm text-foreground truncate">{p.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Affiche les 3 joueurs les plus importants d'une équipe (score le plus élevé)
function KeyPlayersColumn({ teamName, players }: { teamName: string; players: KeyPlayer[] }) {
  if (players.length === 0) return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{teamName}</p>
      <p className="text-xs text-muted-foreground italic">Pas de données</p>
    </div>
  )

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{teamName}</p>
      <ul className="space-y-1.5">
        {players.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            {/* Médaille 1er / 2e / 3e */}
            <span className={cn(
              "text-[10px] font-bold w-4 text-center shrink-0",
              i === 0 && "text-yellow-500",
              i === 1 && "text-slate-400",
              i === 2 && "text-amber-700",
            )}>
              {i + 1}
            </span>
            <span className="text-sm text-foreground truncate flex-1">{p.name}</span>
            <span className="text-[10px] text-muted-foreground/70 shrink-0">{p.score.toFixed(0)}pts</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Affiche les joueurs absents pour ce match, avec une icône warning si l'absence est impactante
function AbsentsColumn({ teamName, players }: { teamName: string; players: KeyPlayer[] }) {
  if (players.length === 0) return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{teamName}</p>
      <p className="text-xs text-muted-foreground italic">Aucun absent</p>
    </div>
  )

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{teamName}</p>
      <ul className="space-y-1.5">
        {players.map(p => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-destructive/15 text-destructive text-[9px] font-bold rounded uppercase shrink-0">
              {p.position ? p.position.slice(0, 3) : 'N/A'}
            </span>
            <span className="text-sm text-muted-foreground line-through truncate flex-1">{p.name}</span>
            {/* Icône d'avertissement si l'absence est considérée impactante */}
            {p.isImpactAbsent && (
              <AlertTriangle
                className="h-3.5 w-3.5 text-yellow-500 shrink-0"
                aria-label="Absence impactante"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FormDisplay({ form }: { form: string }) {
  return (
    <div className="flex items-center gap-0.5 mt-2">
      {form.split('').map((result, i) => (
        <span
          key={i}
          className={cn(
            "w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded text-white",
            result === 'W' && "bg-[var(--win)]",
            result === 'D' && "bg-[var(--draw)]",
            result === 'L' && "bg-[var(--loss)]"
          )}
        >
          {result}
        </span>
      ))}
    </div>
  )
}
