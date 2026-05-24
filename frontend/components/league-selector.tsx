'use client'

import { LEAGUES, League } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface LeagueSelectorProps {
  selectedLeague: string
  onLeagueChange: (league: string) => void
}

export function LeagueSelector({ selectedLeague, onLeagueChange }: LeagueSelectorProps) {
  const allOption = { id: 'all', name: 'Tous les matchs', country: '', flag: '⚽', logo: '' }
  const options = [allOption, ...LEAGUES]

  return (
    <div className="bg-card border-b border-border">
      <div className="mx-auto max-w-7xl px-4">
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 py-3">
            {options.map((league) => (
              <Button
                key={league.id}
                variant="ghost"
                onClick={() => onLeagueChange(league.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                  selectedLeague === league.id
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <span className="text-base">{league.flag}</span>
                <span>{league.name}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LeagueHeader({ league }: { league: League }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--league-header)] border-b border-border">
      <span className="text-xl">{league.flag}</span>
      <div className="flex flex-col">
        <span className="font-semibold text-foreground">{league.name}</span>
        <span className="text-xs text-muted-foreground">{league.country}</span>
      </div>
    </div>
  )
}
