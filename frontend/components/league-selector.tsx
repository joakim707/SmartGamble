'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LEAGUES, League } from '@/lib/types'
import { cn } from '@/lib/utils'

export function LeagueSelector({
  selectedLeague,
  onLeagueChange,
}: {
  selectedLeague?: string
  onLeagueChange?: (league: string) => void
}) {
  const pathname = usePathname()

  return (
    <div className="bg-card border-b border-border">
      <div className="mx-auto max-w-7xl px-4">
        <div className="overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 py-3">
            {/* Tous les matchs → page principale */}
            <Link
              href="/"
              onClick={() => onLeagueChange?.('all')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                pathname === '/' && !selectedLeague || (pathname === '/' && selectedLeague === 'all')
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <span className="text-base">⚽</span>
              <span>Tous les matchs</span>
            </Link>

            {LEAGUES.map(league => {
              const isActive = pathname === `/ligue/${league.id}`
              return (
                <Link
                  key={league.id}
                  href={`/ligue/${league.id}`}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <span className="text-base">{league.flag}</span>
                  <span>{league.name}</span>
                </Link>
              )
            })}
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
