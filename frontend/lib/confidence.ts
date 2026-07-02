// Calcul des probabilités 1/X/2 basé sur la forme récente des équipes

export interface OutcomeProbabilities {
  home: number  // 0–100
  draw: number
  away: number
  best: 'home' | 'draw' | 'away'
}

function formScore(form: string): number {
  // Plus récent = plus de poids (indice 0 = dernier match)
  const weights = [1.5, 1.3, 1.1, 0.9, 0.7]
  let score = 0, max = 0
  form.split('').reverse().forEach((r, i) => {
    const w = weights[i] ?? 0.5
    score += w * (r === 'W' ? 3 : r === 'D' ? 1 : 0)
    max += w * 3
  })
  return max > 0 ? score / max : 0.33
}

export function computeOutcomeProbabilities(
  homeForm?: string,
  awayForm?: string,
): OutcomeProbabilities | null {
  if (!homeForm || !awayForm || homeForm.length === 0 || awayForm.length === 0) return null

  const homeStrength = formScore(homeForm) * 1.1  // avantage domicile +10%
  const awayStrength = formScore(awayForm)
  const drawBase = 0.25

  const total = homeStrength + drawBase + awayStrength
  const homeP = Math.round((homeStrength / total) * 100)
  const awayP = Math.round((awayStrength / total) * 100)
  const drawP = 100 - homeP - awayP

  const best: 'home' | 'draw' | 'away' =
    homeP >= drawP && homeP >= awayP ? 'home' :
    awayP >= drawP ? 'away' : 'draw'

  return { home: homeP, draw: drawP, away: awayP, best }
}
