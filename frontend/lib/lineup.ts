import { supabase } from './supabase'
import { Player } from './types'

// Saison en cours — à mettre à jour chaque été
export const DEFAULT_SEASON = '2025-26'

// Score minimum pour qu'une absence soit considérée comme "impactante"
// (ajuster selon les données réelles de la saison)
const IMPACT_THRESHOLD = 50

export interface LineupPlayer extends Player {
  score: number
}

// Joueur clé ou joueur absent avec évaluation d'impact
export interface KeyPlayer extends Player {
  score: number
  isImpactAbsent: boolean
}

interface RawStats {
  minutes_played: number
  goals: number
  assists: number
}

// ─── Formule de scoring ─────────────────────────────────────────────────────
// Chaque poste a sa propre pondération pour refléter son rôle dans le jeu

function computeScore(position: string | null, stats: RawStats): number {
  const { minutes_played: mp, goals, assists } = stats
  let score = 0

  switch (position) {
    case 'Goalkeeper':
      // Un gardien se juge surtout sur le temps de jeu
      score = mp * 0.1
      break
    case 'Defender':
      // Un défenseur qui marque est un gros bonus
      score = mp * 0.1 + goals * 2
      break
    case 'Midfielder':
      // Le milieu contribue aux buts et aux passes décisives
      score = mp * 0.1 + goals * 3 + assists * 2
      break
    case 'Forward':
      // L'attaquant est avant tout évalué sur ses buts
      score = goals * 4 + assists * 2 + mp * 0.1
      break
    default:
      score = mp * 0.1
  }

  // Bonus d'expérience : joueur ayant dépassé 1000 minutes cette saison
  if (mp > 1000) score += 2
  return score
}

// ─── Sélection algorithme (11 titulaires) — utilisé en fallback ─────────────
// Gardé pour le cas où SofaScore n'a pas encore publié la composition

const QUOTAS: Record<string, { min: number; max: number }> = {
  Defender:   { min: 3, max: 5 },
  Midfielder: { min: 3, max: 5 },
  Forward:    { min: 1, max: 3 },
}

function selectEleven(pool: LineupPlayer[]): LineupPlayer[] {
  const byPos: Record<string, LineupPlayer[]> = {
    Goalkeeper: [],
    Defender:   [],
    Midfielder: [],
    Forward:    [],
  }

  for (const p of pool) {
    const pos    = p.position ?? 'Midfielder'
    const bucket = byPos[pos] ?? byPos['Midfielder']
    bucket.push(p)
  }
  for (const bucket of Object.values(byPos)) {
    bucket.sort((a, b) => b.score - a.score)
  }

  const selected: LineupPlayer[] = []

  // 1 gardien obligatoire
  if (byPos.Goalkeeper.length > 0) selected.push(byPos.Goalkeeper.shift()!)

  // Minimums par poste (3 DEF + 3 MID + 1 ATT + GK = 8 joueurs)
  for (const [pos, quota] of Object.entries(QUOTAS)) {
    const take = Math.min(quota.min, byPos[pos].length)
    selected.push(...byPos[pos].splice(0, take))
  }

  // Remplir les 3 places restantes avec les meilleurs candidats
  while (selected.length < 11) {
    const counts: Record<string, number> = {
      Defender:   selected.filter(p => p.position === 'Defender').length,
      Midfielder: selected.filter(p => p.position === 'Midfielder').length,
      Forward:    selected.filter(p => p.position === 'Forward').length,
    }

    let bestScore = -Infinity
    let bestPos   = ''

    for (const [pos, quota] of Object.entries(QUOTAS)) {
      if (counts[pos] >= quota.max) continue
      if (byPos[pos].length === 0) continue
      if (byPos[pos][0].score > bestScore) {
        bestScore = byPos[pos][0].score
        bestPos   = pos
      }
    }

    if (!bestPos) break
    selected.push(byPos[bestPos].shift()!)
  }

  return selected
}

// ─── A) Composition réelle (SofaScore) ──────────────────────────────────────

/**
 * Retourne les titulaires d'une équipe pour un match donné,
 * tels que stockés par fetch_lineups.py depuis SofaScore.
 * Retourne [] si la composition n'est pas en BDD ou incomplète (< 10 joueurs).
 * Le seuil de 10 distingue une vraie compo SofaScore d'un vestige de l'algo maison.
 */
async function getRealLineup(
  matchId: number,
  teamId: number,
): Promise<LineupPlayer[]> {
  // Étape 1 : récupérer les player_id titulaires pour ce match/équipe
  const { data: lineupRows } = await supabase
    .from('lineup')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('team_id', teamId)
    .eq('is_starter', true)
    .eq('is_absent', false)

  if (!lineupRows || lineupRows.length === 0) return []

  const playerIds = lineupRows.map((r: any) => r.player_id)

  // Étape 2 : récupérer les détails des joueurs
  const { data: players } = await supabase
    .from('player')
    .select('id, name, position, nationality, shirt_number, sofascore_id')
    .in('id', playerIds)

  if (!players) return []

  // Ne garder que les joueurs SofaScore (sofascore_id non null)
  const sofascorePlayers = players.filter(p => p.sofascore_id != null)

  // Moins de 10 → compo SofaScore pas encore disponible pour ce match
  if (sofascorePlayers.length < 10) return []

  return sofascorePlayers.map(p => ({
    id:          p.id,
    name:        p.name,
    position:    p.position ?? null,
    nationality: p.nationality ?? null,
    shirtNumber: p.shirt_number ?? null,
    photoUrl:    null,
    score:       0,
  }))
}

/**
 * Retourne la composition SofaScore d'une équipe pour un match.
 * Retourne [] si la compo n'est pas encore disponible (fetch_lineups pas encore passé).
 * L'algo maison n'est plus utilisé pour générer la compo — uniquement pour les
 * joueurs clés (getKeyPlayers) et l'impact des absents (getAbsentImpact).
 */
export async function getProbableLineup(
  matchId: number,
  teamId: number,
  season = DEFAULT_SEASON,
): Promise<LineupPlayer[]> {
  return getRealLineup(matchId, teamId)
}

// ─── B) Joueurs clés ─────────────────────────────────────────────────────────

/**
 * Retourne les 3 joueurs les plus régulièrement titulaires pour cette équipe.
 * Le score = nombre de titularisations dans nos données (proxy de l'importance).
 */
export async function getKeyPlayers(
  teamId: number,
  season = DEFAULT_SEASON, // conservé pour compatibilité API, non utilisé
): Promise<KeyPlayer[]> {

  // Toutes les titularisations pour cette équipe
  const { data: rows } = await supabase
    .from('lineup')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('is_starter', true)
    .eq('is_absent', false)

  if (!rows || rows.length === 0) return []

  // Compter les titularisations par joueur
  const counts = new Map<number, number>()
  for (const r of rows) {
    counts.set(r.player_id, (counts.get(r.player_id) ?? 0) + 1)
  }

  // Top 3 par nombre de titularisations
  const topIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id)

  if (topIds.length === 0) return []

  const { data: players } = await supabase
    .from('player')
    .select('id, name, position, nationality, shirt_number')
    .in('id', topIds)

  if (!players) return []

  return topIds
    .map(id => {
      const p = players.find(pl => pl.id === id)
      if (!p) return null
      return {
        id:             p.id,
        name:           p.name,
        position:       p.position ?? null,
        nationality:    p.nationality ?? null,
        shirtNumber:    p.shirt_number ?? null,
        photoUrl:       null,
        score:          counts.get(id)!,
        isImpactAbsent: false,
      }
    })
    .filter(Boolean) as KeyPlayer[]
}

// ─── C) Impact des absents ───────────────────────────────────────────────────

/**
 * Retourne les joueurs absents pour CE match avec leur nombre habituel de
 * titularisations comme mesure d'impact.
 * isImpactAbsent = true si le joueur était titulaire régulier (≥ 3 fois en BDD).
 */
export async function getAbsentImpact(
  matchId: number,
  teamId: number,
  season = DEFAULT_SEASON, // conservé pour compatibilité API, non utilisé
): Promise<KeyPlayer[]> {

  // Étape 1 : joueurs absents pour CE match
  const { data: absentRows } = await supabase
    .from('lineup')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('team_id', teamId)
    .eq('is_absent', true)

  if (!absentRows || absentRows.length === 0) return []

  const absentIds = absentRows.map((r: any) => r.player_id)

  // Étape 2 : compter les titularisations habituelles de chaque absent
  const { data: starterRows } = await supabase
    .from('lineup')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('is_starter', true)
    .eq('is_absent', false)
    .in('player_id', absentIds)

  const startCounts = new Map<number, number>()
  for (const r of starterRows ?? []) {
    startCounts.set(r.player_id, (startCounts.get(r.player_id) ?? 0) + 1)
  }

  // Étape 3 : détails des joueurs absents
  const { data: players } = await supabase
    .from('player')
    .select('id, name, position, nationality, shirt_number')
    .in('id', absentIds)

  if (!players) return []

  return players.map(p => {
    const starts = startCounts.get(p.id) ?? 0
    return {
      id:             p.id,
      name:           p.name,
      position:       p.position ?? null,
      nationality:    p.nationality ?? null,
      shirtNumber:    p.shirt_number ?? null,
      photoUrl:       null,
      score:          starts,
      isImpactAbsent: starts >= 3,
    }
  })
}
