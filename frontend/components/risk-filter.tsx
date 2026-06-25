'use client'

import { RiskLevel } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Shield, Flame, Target, Sliders } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface RiskFilterProps {
  selectedRisk: RiskLevel | 'all'
  onRiskChange: (risk: RiskLevel | 'all') => void
  targetOdds: number
  onTargetOddsChange: (odds: number) => void
}

export function RiskFilter({ selectedRisk, onRiskChange, targetOdds, onTargetOddsChange }: RiskFilterProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const riskOptions = [
    { 
      id: 'all' as const, 
      label: 'Tous', 
      icon: Target,
      description: 'Voir tous les matchs',
      color: 'text-muted-foreground'
    },
    { 
      id: 'low' as const, 
      label: 'Faible', 
      icon: Shield,
      description: 'Cotes < 1.80, haute fiabilité',
      color: 'text-green-400'
    },
    { 
      id: 'medium' as const, 
      label: 'Modéré', 
      icon: Sliders,
      description: 'Cotes 1.80-2.50, équilibré',
      color: 'text-yellow-400'
    },
    { 
      id: 'high' as const, 
      label: 'Élevé', 
      icon: Flame,
      description: 'Cotes > 2.50, haut rendement',
      color: 'text-orange-400'
    },
  ]

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Filtres de risque</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-muted-foreground"
          >
            {showAdvanced ? 'Masquer' : 'Options avancées'}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Risk Level Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {riskOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => onRiskChange(option.id)}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg transition-all",
                "border border-border hover:border-primary/50",
                selectedRisk === option.id && "bg-primary/10 border-primary"
              )}
            >
              <option.icon className={cn("h-5 w-5", option.color)} />
              <span className="text-sm font-medium text-foreground">{option.label}</span>
              <span className="text-[10px] text-muted-foreground text-center hidden sm:block">
                {option.description}
              </span>
            </button>
          ))}
        </div>

        {/* Advanced Options */}
        {showAdvanced && (
          <div className="pt-4 border-t border-border space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-foreground">
                  Cote cible
                </label>
                <span className="text-lg font-bold text-primary">
                  {targetOdds.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[targetOdds]}
                onValueChange={([value]) => onTargetOddsChange(value)}
                min={1.1}
                max={10}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">1.10</span>
                <span className="text-[10px] text-muted-foreground">10.00</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              La plateforme vous proposera les options les moins risquées pour atteindre cette cote cible.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
