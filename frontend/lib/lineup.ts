import { supabase } from './supabase'
import { Player } from './types'

export const DEFAULT_SEASON = '2024-25'

export interface LineupPlayer extends Player {
  score: number
}

interface RawStats {
  minutes_played: number
  goals: number
  assists: number
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function computeScore(position: string | null, stats: RawStats): number {
  const { minutes_played: mp, goals, assists } = stats
  let score = 0

  switch (position) {
    case 'Goalkeeper':
      score = mp * 0.1
      break
    case 'Defender':
      score = mp * 0.1 + goals * 2
      break
    case 'Midfielder':
      score = mp * 0.1 + goals * 3 + assists * 2
      break
    case 'Forward':
      score = goals * 4 + assists * 2 + mp * 0.1
      break
    default:
      score = mp * 0.1
  }

  if (mp > 1000) score += 2
  return score
}

// ─── Selection (exactement 11) ───────────────────────────────────────────────

const QUOTAS: Record<string, { min: number; max: number }> = {
  Defender:   { min: 3, max: 5 },
  Midfielder: { min: 3, max: 5 },
  Forward:    { min: 1, max: 3 },
}

function selectEleven(pool: LineupPlayer[]): LineupPlayer[] {
  // Répartir par poste, triés par score décroissant
  const byPos: Record<string, LineupPlayer[]> = {
    Goalkeeper: [],
    Defender:   [],
    Midfielder: [],
    Forward:    [],
  }

  for (const p of pool) {
    const pos = p.position ?? 'Midfielder'
    const bucket = byPos[pos] ?? byPos['Midfielder']
    bucket.push(p)
  }
  for (const bucket of Object.values(byPos)) {
    bucket.sort((a, b) => b.score - a.score)
  }

  const selected: LineupPlayer[] = []

  // 1 gardien obligatoire
  if (byPos.Goalkeeper.length > 0) {
    selected.push(byPos.Goalkeeper.shift()!)
  }

  // Minimums par poste (3 DEF, 3 MID, 1 ATT → 7 + GK = 8)
  for (const [pos, quota] of Object.entries(QUOTAS)) {
    const take = Math.min(quota.min, byPos[pos].length)
    selected.push(...byPos[pos].splice(0, take))
  }

  // Distribuer les 3 spots restants au meilleur candidat disponible
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

// ─── Point d'entrée ──────────────────────────────────────────────────────────

export async function getProbableLineup(
  matchId: number,
  teamId: number,
  season = DEFAULT_SEASON
): Promise<LineupPlayer[]> {

  // 1. Vérifier le cache
  const { data: cached } = await supabase
    .from('lineup')
    .select(`
      score,
      player:player_id (
        id, name, position, nationality, shirt_number
      )
    `)
    .eq('match_id', matchId)
    .eq('team_id', teamId)
    .eq('is_starter', true)

  if (cached && cached.length === 11) {
    return cached.map((row: any) => ({
      id:          row.player.id,
      name:        row.player.name,
      position:    row.player.position ?? null,
      nationality: row.player.nationality ?? null,
      shirtNumber: row.player.shirt_number ?? null,
      photoUrl:    null,
      score:       Number(row.score ?? 0),
    }))
  }

  // 2. Récupérer les joueurs disponibles
  const { data: players } = await supabase
    .from('player')
    .select('id, name, position, nationality, shirt_number')
    .eq('team_id', teamId)
    .eq('is_absent', false)

  if (!players || players.length === 0) return []

  // 3. Récupérer les stats de la saison
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

  // 4. Scorer
  const scored: LineupPlayer[] = players.map(p => ({
    id:          p.id,
    name:        p.name,
    position:    p.position ?? null,
    nationality: p.nationality ?? null,
    shirtNumber: p.shirt_number ?? null,
    photoUrl:    null,
    score:       computeScore(
      p.position,
      statsMap.get(p.id) ?? { minutes_played: 0, goals: 0, assists: 0 }
    ),
  }))

  // 5. Sélectionner 11
  const starters = selectEleven(scored)

  // 6. Persister (ignorer erreur si lineup déjà partielle en base)
  if (starters.length > 0) {
    await supabase.from('lineup').upsert(
      starters.map(p => ({
        match_id:   matchId,
        team_id:    teamId,
        player_id:  p.id,
        is_starter: true,
        score:      p.score,
      })),
      { onConflict: 'match_id,team_id,player_id' }
    )
  }

  return starters
}
