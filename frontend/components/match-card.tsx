'use client'

import Image from 'next/image'
import { Match } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface MatchCardProps {
  match: Match
  onClick?: () => void
}

export function MatchCard({ match, onClick }: MatchCardProps) {
  const [imgErr, setImgErr] = useState<Record<number, boolean>>({})

  const dateStr = new Date(match.matchDate).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  const timeStr = new Date(match.matchDate).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/40 hover:bg-secondary/30 transition-all flex flex-col gap-4"
    >
      {/* Date + statut */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{dateStr}</span>
        {match.status === 'live' ? (
          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 font-bold rounded animate-pulse">LIVE</span>
        ) : match.status === 'finished' ? (
          <span className="text-muted-foreground/60">Terminé</span>
        ) : (
          <span>{timeStr}</span>
        )}
      </div>

      {/* Équipes */}
      <div className="flex flex-col gap-3">
        <TeamRow team={match.homeTeam} imgErr={imgErr} setImgErr={setImgErr} />
        <TeamRow team={match.awayTeam} imgErr={imgErr} setImgErr={setImgErr} />
      </div>
    </div>
  )
}

function TeamRow({
  team, imgErr, setImgErr,
}: {
  team: Match['homeTeam']
  imgErr: Record<number, boolean>
  setImgErr: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Logo */}
      <div className="relative h-8 w-8 shrink-0">
        {!imgErr[team.id] && team.logoUrl ? (
          <Image src={team.logoUrl} alt={team.name} fill className="object-contain"
            onError={() => setImgErr(p => ({ ...p, [team.id]: true }))} />
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xs font-bold text-muted-foreground">{team.name.charAt(0)}</span>
          </div>
        )}
      </div>

      {/* Nom */}
      <span className="flex-1 text-sm font-medium truncate">{team.name}</span>

    </div>
  )
}

// Garde la compatibilité avec match-detail-modal
export function OddsBox({ label, value, isHighlighted, onClick }: {
  label: string; value: number; isHighlighted?: boolean; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center min-w-[50px] py-2 px-3 rounded-lg transition-all',
        'bg-[var(--odds-bg)] hover:bg-[var(--odds-hover)]',
        isHighlighted && 'ring-2 ring-primary bg-primary/10'
      )}
    >
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{value.toFixed(2)}</span>
    </button>
  )
}
