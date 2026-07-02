import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMatchDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export function formatMatchTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  })
}

export function getConfidenceLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Très fiable', color: 'text-green-400' }
  if (score >= 65) return { label: 'Fiable',      color: 'text-emerald-400' }
  if (score >= 50) return { label: 'Modéré',      color: 'text-yellow-400' }
  return               { label: 'Risqué',       color: 'text-red-400' }
}
