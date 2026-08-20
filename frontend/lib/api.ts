import { supabase } from './supabase'
import { Match, Player } from './types'

const PREDICT_API_URL = process.env.NEXT_PUBLIC_PREDICT_API_URL || 'http://localhost:5000'
// NEXT_PUBLIC_* est injecté dans le bundle envoyé au navigateur : cette clé est donc
// visible par quiconque inspecte le JS ou le trafic réseau du dashboard. C'est un choix
// assumé pour une démo locale interne, pas une protection valable en production — il
// faudrait alors passer par un appel serveur (route API Next.js) qui garde la clé côté back.
const PREDICT_API_KEY = process.env.NEXT_PUBLIC_PREDICT_API_KEY || ''

/**
 * Interroge l'API de prédiction (data/api_predict.py) pour obtenir un score de
 * confiance réel (probabilité max renvoyée par le modèle) pour chaque match,
 * en un seul appel réseau. Si l'API n'est pas lancée ou répond mal, on ne
 * bloque pas l'affichage des matchs : confidenceScore reste simplement absent.
 */
async function getConfidenceScores(
  matches: { id: number; home_team_id: number; away_team_id: number }[]
): Promise<Map<number, number>> {
  const scores = new Map<number, number>()
  if (matches.length === 0) return scores

  try {
    const res = await fetch(`${PREDICT_API_URL}/predict/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PREDICT_API_KEY },
      body: JSON.stringify({
        matches: matches.map(m => ({ home_team_id: m.home_team_id, away_team_id: m.away_team_id })),
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const { results } = await res.json()
    matches.forEach((m, i) => {
      const r = results?.[i]
      if (r && !r.error) scores.set(m.id, Math.round(r.confidence * 100))
    })
  } catch (err) {
    console.error("API de prédiction indisponible (confidenceScore non calculé) :", err)
  }

  return scores
}

export async function getUpcomingMatches(): Promise<Match[]> {
  // Mode simulation : pas de matchs à venir en intersaison → on affiche les
  // 60 derniers jours de matchs terminés pour pouvoir tester les compositions.
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Essayer les matchs à venir d'abord
  let { data: matchesData, error: matchesError } = await supabase
    .from('match')
    .select(`
      id,
      match_date,
      status,
      league,
      home_team:home_team_id(id, name, short_name, logo_url),
      away_team:away_team_id(id, name, short_name, logo_url)
    `)
    .eq('status', 'upcoming')
    .gte('match_date', new Date().toISOString())
    .in('league', ['Ligue 1', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A'])
    .order('match_date')

  // Aucun match à venir → mode simulation : matchs avec titulaires, Ligue 1 en premier
  if (!matchesError && (!matchesData || matchesData.length === 0)) {
    const simSelect = `
      id,
      match_date,
      status,
      league,
      home_team:home_team_id(id, name, short_name, logo_url),
      away_team:away_team_id(id, name, short_name, logo_url),
      lineup!inner(id)
    `
    const dateFrom = '2026-01-01T00:00:00'
    const dateTo   = '2026-05-29T23:59:59'

    const fetchLeague = (league: string, limit: number) =>
      supabase.from('match')
        .select(simSelect)
        .eq('status', 'finished')
        .eq('league', league)
        .eq('lineup.is_starter', true)
        .gte('match_date', dateFrom)
        .lte('match_date', dateTo)
        .order('match_date', { ascending: false })
        .limit(limit)

    // Ligue 1 en premier dans les résultats, 20 matchs par ligue
    const [l1, pl, laliga, bl, sa] = await Promise.all([
      fetchLeague('Ligue 1',       20),
      fetchLeague('Premier League', 20),
      fetchLeague('La Liga',        20),
      fetchLeague('Bundesliga',     20),
      fetchLeague('Serie A',        20),
    ])

    // lineup!inner peut dupliquer par entrée → déduplication par id
    const seen = new Set<number>()
    matchesData = [
      ...(l1.data   || []),
      ...(pl.data   || []),
      ...(laliga.data || []),
      ...(bl.data   || []),
      ...(sa.data   || []),
    ].filter((m: any) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
    matchesError = l1.error || pl.error || laliga.error || bl.error || sa.error
  }

  if (matchesError || !matchesData) {
    console.error("Erreur Supabase (matchs):", matchesError)
    return []
  }

  // 2. Récupérer les cotes et la forme des équipes en parallèle
  const matchIds  = matchesData.map(m => m.id)
  const teamIds   = [...new Set(matchesData.flatMap((m: any) => [m.home_team.id, m.away_team.id]))]

  const [{ data: oddsData }, { data: formData }, confidenceScores] = await Promise.all([
    supabase.from('odds').select('*').in('match_id', matchIds),
    supabase.from('team_stats').select('team_id, form').in('team_id', teamIds).eq('season', '2024-25'),
    getConfidenceScores(matchesData.map((m: any) => ({
      id: m.id,
      home_team_id: m.home_team.id,
      away_team_id: m.away_team.id,
    }))),
  ])

  // 3. Map forme par équipe
  const formMap = new Map<number, string>()
  formData?.forEach(ts => { if (ts.form) formMap.set(ts.team_id, ts.form) })

  // 4. Regrouper les cotes par match
  const oddsMap = new Map()
  if (oddsData) {
    oddsData.forEach(odd => {
      if (!oddsMap.has(odd.match_id)) {
        oddsMap.set(odd.match_id, { homes: [], draws: [], aways: [], bookmakers: [] })
      }
      const matchOdds = oddsMap.get(odd.match_id)
      if (odd.odds_home) matchOdds.homes.push(odd.odds_home)
      if (odd.odds_draw) matchOdds.draws.push(odd.odds_draw)
      if (odd.odds_away) matchOdds.aways.push(odd.odds_away)
      if (odd.bookmaker) matchOdds.bookmakers.push({ name: odd.bookmaker, home: odd.odds_home, draw: odd.odds_draw, away: odd.odds_away })
    })
  }

  // 5. Formater les données pour le composant React
  return matchesData.map((m: any): Match => {
    const matchOdds = oddsMap.get(m.id)
    let formattedOdds = undefined

    if (matchOdds && matchOdds.homes.length > 0) {
      // Calcul des moyennes
      formattedOdds = {
        home: matchOdds.homes.reduce((a: number, b: number) => a + b, 0) / matchOdds.homes.length,
        draw: matchOdds.draws.reduce((a: number, b: number) => a + b, 0) / matchOdds.draws.length,
        away: matchOdds.aways.reduce((a: number, b: number) => a + b, 0) / matchOdds.aways.length,
        bookmakers: matchOdds.bookmakers
      }
    }

    return {
      id: m.id,
      league: m.league || 'Ligue 1',
      matchDate: m.match_date,
      status: m.status as Match['status'],
      homeTeam: {
        id: m.home_team.id,
        name: m.home_team.name,
        shortName: m.home_team.short_name || m.home_team.name.substring(0, 3).toUpperCase(),
        logoUrl: m.home_team.logo_url || '/placeholder-logo.png',
        league: m.league
      },
      awayTeam: {
        id: m.away_team.id,
        name: m.away_team.name,
        shortName: m.away_team.short_name || m.away_team.name.substring(0, 3).toUpperCase(),
        logoUrl: m.away_team.logo_url || '/placeholder-logo.png',
        league: m.league
      },
      odds: formattedOdds,
      homeForm: formMap.get(m.home_team.id),
      awayForm: formMap.get(m.away_team.id),
      confidenceScore: confidenceScores.get(m.id)
    }
  })
}

export interface TeamForm {
  teamId: number
  name: string
  shortName: string
  logoUrl: string
  league: string
  form: string
}

export async function getTeamForms(): Promise<TeamForm[]> {
  const { data, error } = await supabase
    .from('team_stats')
    .select(`
      form,
      team:team_id (id, name, short_name, logo_url, league)
    `)
    .eq('season', '2024-25')
    .not('form', 'is', null)

  if (error || !data) return []

  return (data as any[])
    .filter(row => row.team && row.form)
    .map(row => ({
      teamId:    row.team.id,
      name:      row.team.name,
      shortName: row.team.short_name || row.team.name.substring(0, 3).toUpperCase(),
      logoUrl:   row.team.logo_url || '/placeholder-logo.png',
      league:    row.team.league,
      form:      row.form as string,
    }))
}

export async function getAbsentPlayersByTeam(teamId: number): Promise<Player[]> {
  const { data, error } = await supabase
    .from('player')
    .select('id, name, position, shirt_number')
    .eq('team_id', teamId)
    .eq('is_absent', true)
    .order('position')

  if (error || !data) return []

  return data.map(p => ({
    id:          p.id,
    name:        p.name,
    position:    p.position ?? null,
    nationality: null,
    shirtNumber: p.shirt_number ?? null,
    photoUrl:    null,
  }))
}

export async function getPlayersByTeam(teamId: number): Promise<Player[]> {
  const { data, error } = await supabase
    .from('player')
    .select('id, name, position, nationality, shirt_number')
    .eq('team_id', teamId)
    .order('position')

  if (error || !data) return []

  return data.map(p => ({
    id: p.id,
    name: p.name,
    position: p.position ?? null,
    nationality: p.nationality ?? null,
    shirtNumber: p.shirt_number ?? null,
    photoUrl: null,
  }))
}