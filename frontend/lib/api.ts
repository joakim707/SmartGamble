import { supabase } from './supabase'
import { Match, Player } from './types'

export async function getAllSeasonMatches(): Promise<Match[]> {
  const { data: matchesData, error } = await supabase
    .from('match')
    .select(`
      id,
      match_date,
      status,
      league,
      score_home,
      score_away,
      home_team:home_team_id(id, name, short_name, logo_url),
      away_team:away_team_id(id, name, short_name, logo_url)
    `)
    .in('league', ['Ligue 1', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A'])
    .in('status', ['finished', 'upcoming', 'live'])
    .order('match_date', { ascending: false })
    .limit(2000)

  if (error || !matchesData) {
    console.error('Erreur Supabase (matchs):', error)
    return []
  }

  const matchIds = matchesData.map(m => m.id)
  const teamIds  = [...new Set(matchesData.flatMap((m: any) => [m.home_team.id, m.away_team.id]))]

  const [{ data: oddsData }, { data: formData }] = await Promise.all([
    supabase.from('odds').select('*').in('match_id', matchIds),
    supabase.from('team_stats').select('team_id, form').in('team_id', teamIds).eq('season', '2024-25'),
  ])

  const formMap = new Map<number, string>()
  formData?.forEach(ts => { if (ts.form) formMap.set(ts.team_id, ts.form) })

  const oddsMap = new Map()
  oddsData?.forEach(odd => {
    if (!oddsMap.has(odd.match_id)) {
      oddsMap.set(odd.match_id, { homes: [], draws: [], aways: [], bookmakers: [] })
    }
    const o = oddsMap.get(odd.match_id)
    if (odd.odds_home) o.homes.push(odd.odds_home)
    if (odd.odds_draw) o.draws.push(odd.odds_draw)
    if (odd.odds_away) o.aways.push(odd.odds_away)
    if (odd.bookmaker) o.bookmakers.push({ name: odd.bookmaker, home: odd.odds_home, draw: odd.odds_draw, away: odd.odds_away })
  })

  return matchesData.map((m: any): Match => {
    const mo = oddsMap.get(m.id)
    const formattedOdds = mo?.homes.length > 0 ? {
      home: mo.homes.reduce((a: number, b: number) => a + b, 0) / mo.homes.length,
      draw: mo.draws.reduce((a: number, b: number) => a + b, 0) / mo.draws.length,
      away: mo.aways.reduce((a: number, b: number) => a + b, 0) / mo.aways.length,
      bookmakers: mo.bookmakers,
    } : undefined

    return {
      id:        m.id,
      league:    m.league || 'Unknown',
      matchDate: m.match_date,
      status:    m.status as Match['status'],
      scoreHome: m.score_home ?? undefined,
      scoreAway: m.score_away ?? undefined,
      homeTeam: {
        id:        m.home_team.id,
        name:      m.home_team.name,
        shortName: m.home_team.short_name || m.home_team.name.substring(0, 3).toUpperCase(),
        logoUrl:   m.home_team.logo_url || '/placeholder-logo.png',
        league:    m.league,
      },
      awayTeam: {
        id:        m.away_team.id,
        name:      m.away_team.name,
        shortName: m.away_team.short_name || m.away_team.name.substring(0, 3).toUpperCase(),
        logoUrl:   m.away_team.logo_url || '/placeholder-logo.png',
        league:    m.league,
      },
      odds:      formattedOdds,
      homeForm:  formMap.get(m.home_team.id),
      awayForm:  formMap.get(m.away_team.id),
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
    id:          p.id,
    name:        p.name,
    position:    p.position ?? null,
    nationality: p.nationality ?? null,
    shirtNumber: p.shirt_number ?? null,
    photoUrl:    null,
  }))
}
