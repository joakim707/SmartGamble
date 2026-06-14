'use client'

import Image from 'next/image'
import { Match } from '@/lib/types'
import { formatMatchTime, formatMatchDate, getConfidenceLabel } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Clock, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface MatchCardProps {
  match: Match
  onClick?: () => void
}

export function MatchCard({ match, onClick }: MatchCardProps) {
  const [imageError, setImageError] = useState<Record<string, boolean>>({})
  const confidence = match.confidenceScore ? getConfidenceLabel(match.confidenceScore) : null
  const isFinished = match.status === 'finished'

  const handleImageError = (teamId: number) => {
    setImageError(prev => ({ ...prev, [teamId]: true }))
  }

  return (
    <div
      className="group bg-card hover:bg-secondary/50 border-b border-border transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center px-4 py-3 gap-4">

        {/* Colonne gauche : heure ou badge FIN */}
        <div className="flex flex-col items-center min-w-[52px]">
          {isFinished ? (
            <>
              <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                FIN
              </span>
              <span className="text-[10px] text-muted-foreground/70 mt-0.5">
                {formatMatchDate(match.matchDate)}
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="text-xs font-medium">{formatMatchTime(match.matchDate)}</span>
              </div>
              <span className="text-[10px] text-muted-foreground/70 mt-0.5">
                {formatMatchDate(match.matchDate)}
              </span>
              {match.status === 'live' && (
                <span className="mt-1 px-2 py-0.5 bg-[var(--live)] text-white text-[10px] font-bold rounded animate-pulse">
                  LIVE
                </span>
              )}
            </>
          )}
        </div>

        {/* Équipes + score */}
        <div className="flex-1 min-w-0">
          <TeamRow
            team={match.homeTeam}
            form={match.homeForm}
            score={isFinished ? match.scoreHome : undefined}
            imageError={imageError[match.homeTeam.id]}
            onImageError={() => handleImageError(match.homeTeam.id)}
          />
          <TeamRow
            team={match.awayTeam}
            form={match.awayForm}
            score={isFinished ? match.scoreAway : undefined}
            imageError={imageError[match.awayTeam.id]}
            onImageError={() => handleImageError(match.awayTeam.id)}
          />
        </div>

        {/* Cotes (matchs à venir et live) */}
        {match.odds && !isFinished && (
          <div className="flex items-center gap-2">
            <OddsBox label="1" value={match.odds.home} />
            <OddsBox label="X" value={match.odds.draw} />
            <OddsBox label="2" value={match.odds.away} />
          </div>
        )}

        {/* Score centré pour matchs terminés */}
        {isFinished && (match.scoreHome !== undefined || match.scoreAway !== undefined) && (
          <div className="hidden sm:flex items-center justify-center gap-1 min-w-[64px]">
            <span className="text-xl font-bold text-foreground">{match.scoreHome ?? '?'}</span>
            <span className="text-muted-foreground text-sm">–</span>
            <span className="text-xl font-bold text-foreground">{match.scoreAway ?? '?'}</span>
          </div>
        )}

        {/* Indice de confiance (matchs à venir) */}
        {confidence && !isFinished && (
          <div className="hidden sm:flex flex-col items-center min-w-[72px]">
            <span className={cn('text-lg font-bold', confidence.color)}>
              {match.confidenceScore}%
            </span>
            <span className="text-[10px] text-muted-foreground">{confidence.label}</span>
          </div>
        )}

        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

interface TeamRowProps {
  team: Match['homeTeam']
  form?: string
  score?: number
  imageError?: boolean
  onImageError: () => void
}

function TeamRow({ team, form, score, imageError, onImageError }: TeamRowProps) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="relative h-5 w-5 flex-shrink-0">
        {!imageError ? (
          <Image
            src={team.logoUrl}
            alt={team.name}
            fill
            className="object-contain"
            onError={onImageError}
          />
        ) : (
          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
            <span className="text-[10px] font-bold text-muted-foreground">
              {team.shortName.charAt(0)}
            </span>
          </div>
        )}
      </div>
      <span className="font-medium text-foreground truncate flex-1 text-sm">{team.name}</span>
      {form && <FormBadges form={form} />}
      {score !== undefined && (
        <span className="text-sm font-bold text-foreground ml-2 sm:hidden">{score}</span>
      )}
    </div>
  )
}

function FormBadges({ form }: { form: string }) {
  return (
    <div className="hidden md:flex items-center gap-0.5">
      {form.split('').map((result, i) => (
        <span
          key={i}
          className={cn(
            'w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded text-white',
            result === 'W' && 'bg-[var(--win)]',
            result === 'D' && 'bg-[var(--draw)]',
            result === 'L' && 'bg-[var(--loss)]'
          )}
        >
          {result}
        </span>
      ))}
    </div>
  )
}

interface OddsBoxProps {
  label: string
  value: number
  isHighlighted?: boolean
  onClick?: () => void
}

export function OddsBox({ label, value, isHighlighted, onClick }: OddsBoxProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center min-w-[46px] py-1.5 px-2.5 rounded-lg transition-all',
        'bg-[var(--odds-bg)] hover:bg-[var(--odds-hover)]',
        isHighlighted && 'ring-2 ring-primary bg-primary/10'
      )}
    >
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{value.toFixed(2)}</span>
    </button>
  )
}
