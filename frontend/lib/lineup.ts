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
  const { data } = await supabase
    .from('lineup')
    .select(`
      player:player_id (
        id, name, position, nationality, shirt_number, sofascore_id
      )
    `)
    .eq('match_id', matchId)
    .eq('team_id', teamId)
    .eq('is_starter', true)
    .eq('is_absent', false)

  if (!data || data.length === 0) return []

  // Ne garder que les joueurs SofaScore (sofascore_id non null).
  // Les joueurs de l'ancien algo (football-data.org) n'ont pas de sofascore_id.
  const sofascorePlayers = (data as any[]).filter(row => row.player?.sofascore_id != null)

  // Moins de 10 → compo SofaScore pas encore disponible pour ce match
  if (sofascorePlayers.length < 10) return []

  return sofascorePlayers.map(row => ({
    id:          row.player.id,
    name:        row.player.name,
    position:    row.player.position ?? null,
    nationality: row.player.nationality ?? null,
    shirtNumber: row.player.shirt_number ?? null,
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
 * Retourne les 3 joueurs avec le score le plus élevé dans l'effectif.
 * Utilisé pour mettre en avant les stars de chaque équipe dans la modal.
 * Ne tient pas compte de l'absence (un joueur clé peut être absent).
 */
export async function getKeyPlayers(
  teamId: number,
  season = DEFAULT_SEASON,
): Promise<KeyPlayer[]> {

  const { data: players } = await supabase
    .from('player')
    .select('id, name, position, nationality, shirt_number')
    .eq('team_id', teamId)

  if (!players || players.length === 0) return []

  const ids = players.map(p => p.id)
  const { data: statsRows } = await supabase
    .from('player_stats')
    .select('player_id, minutes_played, goals, assists')
    .in('player_id', ids)
    .eq('season', season)

  const statsMap = new Map<number, RawStats>()
  for (const s of statsRows ?? []) {
    statsMap.set(s.player_id, {
      minutes_played: s.minutes_played,
      goals:          s.goals,
      assists:        s.assists,
    })
  }

  // On filtre les joueurs sans stats (pas de données = pas de score calculable)
  return players
    .map(p => ({
      id:             p.id,
      name:           p.name,
      position:       p.position ?? null,
      nationality:    p.nationality ?? null,
      shirtNumber:    p.shirt_number ?? null,
      photoUrl:       null,
      score:          computeScore(
        p.position,
        statsMap.get(p.id) ?? { minutes_played: 0, goals: 0, assists: 0 },
      ),
      isImpactAbsent: false,
    }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// ─── C) Impact des absents ───────────────────────────────────────────────────

/**
 * Retourne les joueurs absents pour CE match (table lineup, is_absent=true)
 * avec leur score calculé et un drapeau "isImpactAbsent" si leur score
 * dépasse le seuil IMPACT_THRESHOLD.
 * Un joueur marqué comme impactant devrait afficher un avertissement dans l'UI.
 */
export async function getAbsentImpact(
  matchId: number,
  teamId: number,
  season = DEFAULT_SEASON,
): Promise<KeyPlayer[]> {

  // Lire les absents depuis la table lineup (spécifique au match)
  const { data: absentRows } = await supabase
    .from('lineup')
    .select(`
      player:player_id (
        id, name, position, nationality, shirt_number
      )
    `)
    .eq('match_id', matchId)
    .eq('team_id', teamId)
    .eq('is_absent', true)

  if (!absentRows || absentRows.length === 0) return []

  const playerIds = (absentRows as any[]).map(r => r.player.id)

  const { data: statsRows } = await supabase
    .from('player_stats')
    .select('player_id, minutes_played, goals, assists')
    .in('player_id', playerIds)
    .eq('season', season)

  const statsMap = new Map<number, RawStats>()
  for (const s of statsRows ?? []) {
    statsMap.set(s.player_id, {
      minutes_played: s.minutes_played,
      goals:          s.goals,
      assists:        s.assists,
    })
  }

  return (absentRows as any[]).map(row => {
    const score = computeScore(
      row.player.position,
      statsMap.get(row.player.id) ?? { minutes_played: 0, goals: 0, assists: 0 },
    )
    return {
      id:             row.player.id,
      name:           row.player.name,
      position:       row.player.position ?? null,
      nationality:    row.player.nationality ?? null,
      shirtNumber:    row.player.shirt_number ?? null,
      photoUrl:       null,
      score,
      // Une absence est "impactante" si le joueur a un score élevé
      isImpactAbsent: score >= IMPACT_THRESHOLD,
    }
  })
}
