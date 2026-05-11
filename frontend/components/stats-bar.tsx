'use client'

import { mockMatches } from '@/lib/mock-data'
import { TrendingUp, Trophy, Clock, Zap } from 'lucide-react'

export function StatsBar() {
  const totalMatches = mockMatches.length
  const avgConfidence = Math.round(
    mockMatches.reduce((acc, m) => acc + (m.confidenceScore || 0), 0) / totalMatches
  )
  const highConfidenceCount = mockMatches.filter(m => (m.confidenceScore || 0) >= 75).length
  const leagues = [...new Set(mockMatches.map(m => m.league))].length

  const stats = [
    { label: 'Matchs à venir', value: totalMatches, icon: Clock },
    { label: 'Championnats', value: leagues, icon: Trophy },
    { label: 'Confiance moyenne', value: `${avgConfidence}%`, icon: TrendingUp },
    { label: 'Haute fiabilité', value: highConfidenceCount, icon: Zap },
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
