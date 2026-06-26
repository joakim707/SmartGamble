import { supabase } from './supabase'
import { Player } from './types'

// Saison en cours — à mettre à jour chaque été
export const DEFAULT_SEASON = '2025-26'

export interface LineupPlayer extends Player {
  score: number
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
    .select('id, name, position')
    .in('id', playerIds)

  if (!players || players.length < 6) return []

  return players.map(p => ({
    id:          p.id,
    name:        p.name,
    position:    p.position ?? null,
    nationality: null,
    shirtNumber: null,
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
 * Détail des trois composantes du score d'un joueur clé.
 * Exposé pour que la modal puisse afficher la ventilation.
 */
export interface KeyPlayerScoreDetail {
  scoreTitularisations: number  // composante régularité (0-1)
  scoreMinutes:         number  // composante temps de jeu (0-1)
  scoreImpact:          number  // composante impact sur résultats (0-3), -1 si non calculable
  nbTitularisations:    number
  minutesJouees:        number
}

export interface KeyPlayer extends Player {
  score: number
  isImpactAbsent: boolean
  detail?: KeyPlayerScoreDetail
}

/**
 * Calcule combien de points (football) une équipe a obtenus sur un match.
 * Victoire = 3, Nul = 1, Défaite = 0.
 * Retourne null si le match n'est pas terminé (score null).
 */
function ptsEquipe(
  teamId: number,
  row: { home_team_id: number; away_team_id: number; score_home: number | null; score_away: number | null }
): number | null {
  if (row.score_home === null || row.score_away === null) return null

  const estDomicile = row.home_team_id === teamId
  const buts        = estDomicile ? row.score_home : row.score_away
  const butsAdverse = estDomicile ? row.score_away : row.score_home

  if (buts > butsAdverse) return 3
  if (buts === butsAdverse) return 1
  return 0
}

/**
 * Retourne les 3 joueurs les plus importants pour cette équipe.
 *
 * FORMULE (joueurs de champ) :
 *   score_final = (score_titu × 0.33) + (score_minutes × 0.33) + (score_impact × 0.33)
 *
 *   score_titu    = nb_titularisations / total_matchs_equipe          → normalisé [0,1]
 *   score_minutes = minutes_jouees / (total_matchs_equipe × 90)       → normalisé [0,1]
 *   score_impact  = (pts_avec - pts_sans) normalisé sur [-3, 3]
 *                   pts_avec = moyenne pts équipe quand le joueur est titulaire
 *                   pts_sans = moyenne pts équipe quand le joueur est absent du lineup
 *                   → si pas assez de matchs "sans" : fallback 50/50 titu+minutes
 *
 * FORMULE (gardiens) :
 *   score_final = (score_titu × 0.5) + (score_minutes × 0.5)
 *   Pas de score_impact (trop dépendant de la défense collective).
 */
export async function getKeyPlayers(
  teamId: number,
  _season = DEFAULT_SEASON,
): Promise<KeyPlayer[]> {

  // ── Étape 1 : récupérer toutes les entrées lineup pour cette équipe ──────
  // On a besoin de : qui est titulaire, dans quel match, et qui est absent
  const { data: lineupRows } = await supabase
    .from('lineup')
    .select('player_id, match_id, is_starter, is_absent')
    .eq('team_id', teamId)

  if (!lineupRows || lineupRows.length === 0) return []

  // ── Étape 2 : calculer le total de matchs distincts joués par l'équipe ──
  const matchIdsEquipe = new Set<number>(lineupRows.map((r: any) => r.match_id))
  const totalMatchs = matchIdsEquipe.size
  if (totalMatchs === 0) return []

  // ── Étape 3 : compter les titularisations par joueur ────────────────────
  // et mémoriser les match_id où chaque joueur est titulaire
  const nbTituParJoueur   = new Map<number, number>()
  const matchsAvecJoueur  = new Map<number, Set<number>>() // match_id où joueur est titulaire

  for (const r of lineupRows) {
    if (r.is_starter && !r.is_absent) {
      nbTituParJoueur.set(r.player_id, (nbTituParJoueur.get(r.player_id) ?? 0) + 1)
      if (!matchsAvecJoueur.has(r.player_id)) matchsAvecJoueur.set(r.player_id, new Set())
      matchsAvecJoueur.get(r.player_id)!.add(r.match_id)
    }
  }

  // Tous les joueurs ayant au moins une titularisation
  const allIds = [...nbTituParJoueur.keys()]
  if (allIds.length === 0) return []

  // ── Étape 4 : récupérer les infos joueurs + stats minutes en parallèle ──
  const [{ data: players }, { data: statsRows }, { data: matchRows }] = await Promise.all([
    supabase.from('player')
      .select('id, name, position')
      .in('id', allIds),

    supabase.from('player_stats')
      .select('player_id, minutes_played')
      .in('player_id', allIds),

    // Tous les matchs terminés de cette équipe (pour calculer pts_avec / pts_sans)
    supabase.from('match')
      .select('id, home_team_id, away_team_id, score_home, score_away')
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .eq('status', 'finished'),
  ])

  if (!players) return []

  // Index minutes par joueur
  const minutesMap = new Map<number, number>()
  for (const s of statsRows ?? []) {
    minutesMap.set(s.player_id, s.minutes_played ?? 0)
  }

  // ── Étape 5 : précalculer les résultats de l'équipe match par match ──────
  // On associe chaque match_id terminé → pts de l'équipe
  const ptsParMatch = new Map<number, number>()
  for (const m of matchRows ?? []) {
    const pts = ptsEquipe(teamId, m)
    if (pts !== null) ptsParMatch.set(m.id, pts)
  }

  // match_id des matchs dans le lineup (pour distinguer "absent" vs "pas encore joué")
  const matchsEnBDD = new Set<number>(lineupRows.map((r: any) => r.match_id))

  // ── Étape 6 : calculer le score final pour chaque joueur ─────────────────
  const scored = players
    .map(p => {
      const nbTitu   = nbTituParJoueur.get(p.id) ?? 0
      const minutes  = minutesMap.get(p.id) ?? 0
      const avecIds  = matchsAvecJoueur.get(p.id) ?? new Set()
      const estGardien = p.position === 'Goalkeeper'

      // Composante 1 — Régularité : nb titularisations normalisé sur totalMatchs
      const scoreTitu = nbTitu / totalMatchs

      // Composante 2 — Temps de jeu : minutes jouées normalisées sur totalMatchs × 90 min
      const maxMinutes = totalMatchs * 90
      const scoreMinutes = maxMinutes > 0 ? Math.min(minutes / maxMinutes, 1) : 0

      // Composante 3 — Impact sur les résultats (joueurs de champ uniquement)
      let scoreImpact = -1 // -1 = non calculable (gardien ou données insuffisantes)
      let scoreFinal  = 0

      if (!estGardien) {
        // Matchs terminés où le joueur était titulaire
        const ptsAvecList = [...avecIds]
          .map(mid => ptsParMatch.get(mid))
          .filter((v): v is number => v !== undefined)

        // Matchs terminés où le joueur figure dans le lineup mais N'EST PAS titulaire
        // (= matchs où l'équipe a joué et lui n'était pas là)
        const matchsSansJoueur = lineupRows
          .filter((r: any) => !avecIds.has(r.match_id))
          .map((r: any) => r.match_id)
        const matchsSansDedupliques = [...new Set<number>(matchsSansJoueur)]
        const ptsSansList = matchsSansDedupliques
          .map(mid => ptsParMatch.get(mid))
          .filter((v): v is number => v !== undefined)

        const ptsMoyAvec = ptsAvecList.length > 0
          ? ptsAvecList.reduce((a, b) => a + b, 0) / ptsAvecList.length
          : null

        const ptsMoySans = ptsSansList.length > 0
          ? ptsSansList.reduce((a, b) => a + b, 0) / ptsSansList.length
          : null

        if (ptsMoyAvec !== null && ptsMoySans !== null) {
          // Normalisation : l'écart max théorique est 3 pts (toujours victoire vs toujours défaite)
          // On ramène l'écart brut ([-3, 3]) vers [0, 1] pour rester dans la même échelle que les autres
          const ecartBrut = ptsMoyAvec - ptsMoySans
          scoreImpact = (ecartBrut + 3) / 6  // → [0, 1] avec 0.5 = neutre

          // score_final avec les 3 composantes à poids égaux
          scoreFinal = scoreTitu * 0.33 + scoreMinutes * 0.33 + scoreImpact * 0.33
        } else {
          // Données insuffisantes pour calculer l'impact → fallback 50/50
          scoreFinal = scoreTitu * 0.5 + scoreMinutes * 0.5
        }
      } else {
        // Gardien : seulement régularité + temps de jeu
        scoreFinal = scoreTitu * 0.5 + scoreMinutes * 0.5
      }

      const detail: KeyPlayerScoreDetail = {
        scoreTitularisations: scoreTitu,
        scoreMinutes,
        scoreImpact,
        nbTitularisations:    nbTitu,
        minutesJouees:        minutes,
      }

      return { p, scoreFinal, detail }
    })
    // Exclure les joueurs sans données suffisantes (score nul = probablement remplaçant pur)
    .filter(({ scoreFinal }) => scoreFinal > 0)
    .sort((a, b) => b.scoreFinal - a.scoreFinal)
    .slice(0, 3)

  return scored.map(({ p, scoreFinal, detail }) => ({
    id:             p.id,
    name:           p.name,
    position:       p.position ?? null,
    nationality:    null,
    shirtNumber:    null,
    photoUrl:       null,
    score:          Math.round(scoreFinal * 100) / 100,
    isImpactAbsent: false,
    detail,
  }))
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
    .select('id, name, position')
    .in('id', absentIds)

  if (!players) return []

  return players.map(p => {
    const starts = startCounts.get(p.id) ?? 0
    return {
      id:             p.id,
      name:           p.name,
      position:       p.position ?? null,
      nationality:    null,
      shirtNumber:    null,
      photoUrl:       null,
      score:          starts,
      isImpactAbsent: starts >= 3,
    }
  })
}
