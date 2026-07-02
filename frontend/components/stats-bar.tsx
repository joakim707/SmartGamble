'use client'

import { Trophy, CheckCircle, Clock, Layers } from 'lucide-react'
import type { Match } from '@/lib/types'

interface StatsBarProps {
  matches: Match[]
}

export function StatsBar({ matches }: StatsBarProps) {
  const total     = matches.length
  const finished  = matches.filter(m => m.status === 'finished').length
  const upcoming  = matches.filter(m => m.status === 'upcoming' || m.status === 'live').length
  const leagues   = [...new Set(matches.map(m => m.league))].length

  const stats = [
    { label: 'Total matchs', value: total,    icon: Layers       },
    { label: 'Terminés',     value: finished,  icon: CheckCircle  },
    { label: 'A venir',      value: upcoming,  icon: Clock        },
    { label: 'Championnats', value: leagues,   icon: Trophy       },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-card rounded-xl border border-border p-4 flex items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <stat.icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
