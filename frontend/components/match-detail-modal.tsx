'use client'

import { Match } from '@/lib/types'
import { getConfidenceLabel, formatMatchDate, formatMatchTime } from '@/lib/mock-data'
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
  X 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import { useState } from 'react'

interface MatchDetailModalProps {
  match: Match | null
  open: boolean
  onClose: () => void
}

export function MatchDetailModal({ match, open, onClose }: MatchDetailModalProps) {
  const [imageError, setImageError] = useState<Record<number, boolean>>({})

  if (!match) return null

  const confidence = match.confidenceScore ? getConfidenceLabel(match.confidenceScore) : null
  const bookmakers = match.odds?.bookmakers || []

  const handleImageError = (teamId: number) => {
    setImageError(prev => ({ ...prev, [teamId]: true }))
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Détail du match
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
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

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={onClose}
            >
              Fermer
            </Button>
            <Button className="flex-1 bg-primary text-primary-foreground">
              Ajouter à mon suivi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
