'use client'

import Image from 'next/image'
import { Match, RiskLevel } from '@/lib/types'
import { formatMatchTime, getConfidenceLabel } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Clock, TrendingUp, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface MatchCardProps {
  match: Match
  onClick?: () => void
}

export function MatchCard({ match, onClick }: MatchCardProps) {
  const [imageError, setImageError] = useState<Record<string, boolean>>({})
  const confidence = match.confidenceScore ? getConfidenceLabel(match.confidenceScore) : null
  
  const handleImageError = (teamId: number) => {
    setImageError(prev => ({ ...prev, [teamId]: true }))
  }

  return (
    <div 
      className="group bg-card hover:bg-secondary/50 border-b border-border transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center px-4 py-3 gap-4">
        {/* Time */}
        <div className="flex flex-col items-center min-w-[60px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="text-xs">{formatMatchTime(match.matchDate)}</span>
          </div>
          {match.status === 'live' && (
            <span className="mt-1 px-2 py-0.5 bg-[var(--live)] text-white text-[10px] font-bold rounded animate-pulse">
              LIVE
            </span>
          )}
        </div>

        {/* Teams */}
        <div className="flex-1 min-w-0">
          <TeamRow 
            team={match.homeTeam} 
            form={match.homeForm} 
            isHome={true}
            imageError={imageError[match.homeTeam.id]}
            onImageError={() => handleImageError(match.homeTeam.id)}
          />
          <TeamRow 
            team={match.awayTeam} 
            form={match.awayForm} 
            isHome={false}
            imageError={imageError[match.awayTeam.id]}
            onImageError={() => handleImageError(match.awayTeam.id)}
          />
        </div>

        {/* Odds */}
        {match.odds && (
          <div className="flex items-center gap-2">
            <OddsBox label="1" value={match.odds.home} />
            <OddsBox label="X" value={match.odds.draw} />
            <OddsBox label="2" value={match.odds.away} />
          </div>
        )}

        {/* Confidence Score */}
        {confidence && (
          <div className="hidden sm:flex flex-col items-center min-w-[80px]">
            <div className="flex items-center gap-1">
              <TrendingUp className={cn("h-3 w-3", confidence.color)} />
              <span className={cn("text-lg font-bold", confidence.color)}>
                {match.confidenceScore}%
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">{confidence.label}</span>
          </div>
        )}

        {/* Arrow */}
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

interface TeamRowProps {
  team: Match['homeTeam']
  form?: string
  isHome: boolean
  imageError?: boolean
  onImageError: () => void
}

function TeamRow({ team, form, isHome, imageError, onImageError }: TeamRowProps) {
  return (
    <div className={cn("flex items-center gap-3", !isHome && "mt-2")}>
      <div className="relative h-6 w-6 flex-shrink-0">
        {!imageError ? (
          <Image
            src={team.logoUrl}
            alt={team.name}
            fill
            className="object-contain"
            onError={onImageError}
          />
        ) : (
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xs font-bold text-muted-foreground">
              {team.shortName.charAt(0)}
            </span>
          </div>
        )}
      </div>
      <span className="font-medium text-foreground truncate flex-1">{team.name}</span>
      {form && <FormBadges form={form} />}
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
        "flex flex-col items-center justify-center min-w-[50px] py-2 px-3 rounded-lg transition-all",
        "bg-[var(--odds-bg)] hover:bg-[var(--odds-hover)]",
        isHighlighted && "ring-2 ring-primary bg-primary/10"
      )}
    >
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{value.toFixed(2)}</span>
    </button>
  )
}
