'use client'

import { Match } from '@/lib/types'
import { LineupPlayer, KeyPlayer, getProbableLineup, getKeyPlayers, getAbsentImpact, DEFAULT_SEASON } from '@/lib/lineup'
import { computeOutcomeProbabilities } from '@/lib/confidence'
import { cn, formatMatchDate, formatMatchTime } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Calendar, Clock, BarChart3, Users, UserX, Star, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { useState, useEffect } from 'react'

// Seuls ces bookmakers sont affichés
const BOOKMAKERS_WHITELIST = ['Winamax', 'Betclic', 'Unibet', 'PMU', 'Bwin']

interface MatchDetailModalProps {
  match: Match | null
  open: boolean
  onClose: () => void
}

const POSITION_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']
const POSITION_LABEL: Record<string, string> = {
  Goalkeeper: 'Gardiens',
  Defender:   'Défenseurs',
  Midfielder: 'Milieux',
  Forward:    'Attaquants',
}
const POSITION_SHORT: Record<string, string> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MIL', Forward: 'ATT',
}
const POSITION_COLOR: Record<string, string> = {
  Goalkeeper: 'bg-yellow-500/20 text-yellow-400',
  Defender:   'bg-blue-500/20 text-blue-400',
  Midfielder: 'bg-green-500/20 text-green-400',
  Forward:    'bg-red-500/20 text-red-400',
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
  const [imgErr, setImgErr]                   = useState<Record<number, boolean>>({})
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
      getProbableLineup(match.id, match.homeTeam.id, DEFAULT_SEASON, match.matchDate),
      getProbableLineup(match.id, match.awayTeam.id, DEFAULT_SEASON, match.matchDate),
      getKeyPlayers(match.homeTeam.id, DEFAULT_SEASON, match.matchDate),
      getKeyPlayers(match.awayTeam.id, DEFAULT_SEASON, match.matchDate),
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

  const bookmakers = (match.odds?.bookmakers ?? [])
    .filter(bk => BOOKMAKERS_WHITELIST.some(w => bk.name.toLowerCase().includes(w.toLowerCase())))

  const probs = computeOutcomeProbabilities(match.homeForm, match.awayForm)
  const hasLineup = homePlayers.length > 0 || awayPlayers.length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[600px] bg-card border-border p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-lg font-semibold text-foreground">Détail du match</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto p-6 space-y-6">

          {/* Date + heure */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{formatMatchDate(match.matchDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{formatMatchTime(match.matchDate)}</span>
            </div>
          </div>

          {/* Équipes */}
          <div className="flex items-center justify-between gap-4 py-4">
            <TeamBlock team={match.homeTeam} label="Domicile" form={match.homeForm} imgErr={imgErr} setImgErr={setImgErr} />
            <span className="text-2xl font-bold text-muted-foreground">VS</span>
            <TeamBlock team={match.awayTeam} label="Extérieur" form={match.awayForm} imgErr={imgErr} setImgErr={setImgErr} />
          </div>

          {/* Probabilités calculées + cotes */}
          {bookmakers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-foreground">Comparaison des cotes</h4>
              </div>

              {/* Résumé probabilités */}
              {probs && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {([ ['1', probs.home, 'home'], ['X', probs.draw, 'draw'], ['2', probs.away, 'away'] ] as const).map(([label, pct, key]) => (
                    <div key={label} className={cn(
                      'flex flex-col items-center rounded-xl p-3 border transition-all',
                      probs.best === key
                        ? 'border-primary bg-primary/10 shadow-[0_0_12px_2px_rgba(var(--primary-rgb),0.25)]'
                        : 'border-border bg-secondary/30'
                    )}>
                      <span className="text-xs text-muted-foreground font-medium">{label}</span>
                      <span className={cn('text-xl font-bold', probs.best === key ? 'text-primary' : 'text-foreground')}>
                        {pct}%
                      </span>
                      {probs.best === key && (
                        <span className="text-[10px] text-primary/80 font-medium mt-0.5">Favori</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tableau des cotes */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-sm font-medium text-muted-foreground">Bookmaker</th>
                      {(['1', 'X', '2'] as const).map((label, i) => {
                        const key = ['home', 'draw', 'away'][i] as 'home' | 'draw' | 'away'
                        return (
                          <th key={label} className={cn(
                            'text-center py-2 text-sm font-medium',
                            probs?.best === key ? 'text-primary' : 'text-muted-foreground'
                          )}>
                            {label}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {bookmakers.map((bk) => (
                      <tr key={bk.name} className="border-b border-border/50">
                        <td className="py-3 text-sm font-medium text-foreground">{bk.name}</td>
                        {[
                          { val: bk.home, key: 'home' as const },
                          { val: bk.draw, key: 'draw' as const },
                          { val: bk.away, key: 'away' as const },
                        ].map(({ val, key }) => (
                          <td key={key} className="py-3 text-center">
                            <span className={cn(
                              'px-3 py-1 rounded text-sm font-bold',
                              probs?.best === key
                                ? 'bg-primary/20 text-primary ring-1 ring-primary/50'
                                : 'bg-[var(--odds-bg)] text-foreground'
                            )}>
                              {val.toFixed(2)}
                            </span>
                          </td>
                        ))}
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

          {/* Compositions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-foreground">Compositions probables</h4>
            </div>
            {lineupLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>
            ) : !hasLineup ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucune composition disponible</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <LineupColumn teamName={match.homeTeam.shortName} players={homePlayers} />
                <LineupColumn teamName={match.awayTeam.shortName} players={awayPlayers} />
              </div>
            )}
          </div>

          {/* Absents */}
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

          <Button variant="outline" className="w-full" onClick={onClose}>Fermer</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TeamBlock({ team, label, form, imgErr, setImgErr }: {
  team: Match['homeTeam']
  label: string
  form?: string
  imgErr: Record<number, boolean>
  setImgErr: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
}) {
  return (
    <div className="flex-1 flex flex-col items-center text-center gap-2">
      <div className="relative h-16 w-16">
        {!imgErr[team.id] && team.logoUrl ? (
          <Image src={team.logoUrl} alt={team.name} fill className="object-contain"
            onError={() => setImgErr(p => ({ ...p, [team.id]: true }))} />
        ) : (
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xl font-bold text-muted-foreground">{team.shortName.charAt(0)}</span>
          </div>
        )}
      </div>
      <h3 className="font-semibold text-foreground text-sm">{team.name}</h3>
      <span className="text-xs text-muted-foreground">{label}</span>
      {form && <FormBadges form={form} />}
    </div>
  )
}

function FormBadges({ form }: { form: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {form.split('').map((r, i) => (
        <span key={i} className={cn(
          'w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded text-white',
          r === 'W' && 'bg-[var(--win)]',
          r === 'D' && 'bg-[var(--draw)]',
          r === 'L' && 'bg-[var(--loss)]',
        )}>{r}</span>
      ))}
    </div>
  )
}

function LineupColumn({ teamName, players }: { teamName: string; players: LineupPlayer[] }) {
  const groups = groupByPosition(players)
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{teamName}</p>
      <div className="space-y-3">
        {POSITION_ORDER.filter(pos => groups[pos]?.length).map(pos => (
          <div key={pos}>
            <p className="text-[10px] font-bold text-primary/80 uppercase tracking-widest mb-1 border-b border-border/40 pb-0.5">
              {POSITION_LABEL[pos]}
            </p>
            <ul className="space-y-1">
              {groups[pos].map(p => (
                <li key={p.id} className="text-sm text-foreground truncate">{p.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

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
            <span className={cn(
              'text-[10px] font-bold w-4 text-center shrink-0',
              i === 0 && 'text-yellow-500',
              i === 1 && 'text-slate-400',
              i === 2 && 'text-amber-700',
            )}>{i + 1}</span>
            {p.position && (
              <span className={cn('px-1 py-0.5 text-[9px] font-bold rounded shrink-0', POSITION_COLOR[p.position] ?? 'bg-muted text-muted-foreground')}>
                {POSITION_SHORT[p.position] ?? p.position.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span className="text-sm text-foreground truncate flex-1">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

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
            {p.isImpactAbsent && <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
          </li>
        ))}
      </ul>
    </div>
  )
}
