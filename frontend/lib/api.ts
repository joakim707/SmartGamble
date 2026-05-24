import { supabase } from './supabase'
import { Match, Player } from './types'

export async function getUpcomingMatches(): Promise<Match[]> {
  // 1. Récupérer les matchs à venir
  const { data: matchesData, error: matchesError } = await supabase
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
    .order('match_date')

  if (matchesError || !matchesData) {
    console.error("Erreur Supabase (matchs):", matchesError)
    return []
  }

  // 2. Récupérer les cotes pour ces matchs
  const matchIds = matchesData.map(m => m.id)
  const { data: oddsData } = await supabase
    .from('odds')
    .select('*')
    .in('match_id', matchIds)

  // 3. Regrouper les cotes par match
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

  // 4. Formater les données pour le composant React
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
      status: 'upcoming',
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
      // Faux score en attendant le modèle d'IA
      confidenceScore: Math.floor(Math.random() * (95 - 60 + 1)) + 60
    }
  })
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