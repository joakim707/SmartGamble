'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Period, formatPeriodLabel, shiftDate } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PeriodSelectorProps {
  period:   Period
  refDate:  Date
  onChange: (period: Period, date: Date) => void
}

export function PeriodSelector({ period, refDate, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Toggle semaine / mois */}
      <div className="flex items-center bg-secondary/50 rounded-lg p-1">
        {(['week', 'month'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => onChange(p, refDate)}
            className={cn(
              'px-3 py-1 rounded-md text-sm font-medium transition-all',
              period === p
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p === 'week' ? 'Semaine' : 'Mois'}
          </button>
        ))}
      </div>

      {/* Navigation prev / next */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(period, shiftDate(refDate, period, -1))}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-sm font-medium min-w-40 text-center">
          {formatPeriodLabel(period, refDate)}
        </span>

        <button
          onClick={() => onChange(period, shiftDate(refDate, period, 1))}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          onClick={() => onChange(period, new Date())}
          className="ml-1 px-2 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          Aujourd'hui
        </button>
      </div>
    </div>
  )
}
