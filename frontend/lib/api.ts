import { supabase } from './supabase'
import { Match, Player } from './types'

// ─── Helpers période ──────────────────────────────────────────────────────────

export type Period = 'week' | 'month'

export function getPeriodBounds(period: Period, refDate: Date): { from: string; to: string } {
  if (period === 'week') {
    const day  = refDate.getDay() || 7           // lundi = 1
    const mon  = new Date(refDate)
    mon.setDate(refDate.getDate() - day + 1)
    mon.setHours(0, 0, 0, 0)
    const sun  = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    sun.setHours(23, 59, 59, 999)
    return { from: mon.toISOString(), to: sun.toISOString() }
  } else {
    const from = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
    const to   = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return { from: from.toISOString(), to: to.toISOString() }
  }
}

export function shiftDate(date: Date, period: Period, direction: 1 | -1): Date {
  const d = new Date(date)
  if (period === 'week') {
    d.setDate(d.getDate() + direction * 7)
  } else {
    d.setMonth(d.getMonth() + direction)
  }
  return d
}

export function formatPeriodLabel(period: Period, refDate: Date): string {
  if (period === 'week') {
    const { from, to } = getPeriodBounds(period, refDate)
    const f = new Date(from)
    const t = new Date(to)
    return `${f.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
  } else {
    return refDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }
}

// ─── Dernière date disponible ─────────────────────────────────────────────────

export async function getLatestMatchDate(): Promise<Date> {
  const { data } = await supabase
    .from('match')
    .select('match_date')
    .not('fd_match_id', 'is', null)
    .order('match_date', { ascending: false })
    .limit(1)
    .single()
  return data ? new Date(data.match_date) : new Date()
}

// ─── Matchs par période ───────────────────────────────────────────────────────

export async function getMatches(
  league: string | null,
  period: Period,
  refDate: Date,
): Promise<Match[]> {
  const { from, to } = getPeriodBounds(period, refDate)

  let query = supabase
    .from('match')
    .select(`
      id, match_date, status, league, score_home, score_away,
      home_team:home_team_id(id, name, short_name, logo_url),
      away_team:away_team_id(id, name, short_name, logo_url)
    `)
    .gte('match_date', from)
    .lte('match_date', to)
    .in('league', ['Ligue 1', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A'])
    .not('fd_match_id', 'is', null)
    .order('match_date')

  if (league) query = query.eq('league', league)

  const { data, error } = await query

  if (error || !data) {
    console.error('Erreur Supabase (matchs):', error)
    return []
  }

  // Récupérer la forme des équipes impliquées (5 derniers matchs terminés avant la période)
  const teamIds = [...new Set<number>(data.flatMap((m: any) => [m.home_team.id, m.away_team.id]))]
  const { data: recentMatches } = await supabase
    .from('match')
    .select('home_team_id, away_team_id, score_home, score_away')
    .eq('status', 'finished')
    .lt('match_date', to)
    .or(teamIds.map(id => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(','))
    .order('match_date', { ascending: false })

  const formMap = new Map<number, string>()
  for (const id of teamIds) {
    const teamMatches = (recentMatches || [])
      .filter((m: any) => m.home_team_id === id || m.away_team_id === id)
      .slice(0, 5)
    const form = teamMatches.map((m: any) => {
      const isHome   = m.home_team_id === id
      const scored   = isHome ? m.score_home : m.score_away
      const conceded = isHome ? m.score_away : m.score_home
      if (scored == null || conceded == null) return 'D'
      return scored > conceded ? 'W' : scored < conceded ? 'L' : 'D'
    }).join('')
    formMap.set(id, form)
  }

  return data.map((m: any): Match => ({
    id:        m.id,
    league:    m.league,
    matchDate: m.match_date,
    status:    m.status as Match['status'],
    scoreHome: m.score_home ?? undefined,
    scoreAway: m.score_away ?? undefined,
    homeForm:  formMap.get(m.home_team.id) || '',
    awayForm:  formMap.get(m.away_team.id) || '',
    homeTeam: {
      id:        m.home_team.id,
      name:      m.home_team.name,
      shortName: m.home_team.short_name || m.home_team.name.substring(0, 3).toUpperCase(),
      logoUrl:   m.home_team.logo_url || '',
      league:    m.league,
    },
    awayTeam: {
      id:        m.away_team.id,
      name:      m.away_team.name,
      shortName: m.away_team.short_name || m.away_team.name.substring(0, 3).toUpperCase(),
      logoUrl:   m.away_team.logo_url || '',
      league:    m.league,
    },
  }))
}

// Alias pour le comparateur : matchs de la semaine courante
export async function getUpcomingMatches(): Promise<Match[]> {
  return getMatches(null, 'week', new Date())
}

// ─── Forme des équipes (1 seule requête) ──────────────────────────────────────

export interface TeamForm {
  teamId:    number
  name:      string
  shortName: string
  logoUrl:   string
  league:    string
  form:      string
}

export async function getTeamForms(league?: string): Promise<TeamForm[]> {
  // 1. Récupérer les équipes
  let teamsQuery = supabase.from('team').select('id, name, short_name, logo_url, league')
  if (league) teamsQuery = teamsQuery.eq('league', league)
  const { data: teams } = await teamsQuery
  if (!teams) return []

  const teamIds = teams.map(t => t.id)

  // 2. Récupérer les 5 derniers matchs de chaque équipe en une seule requête
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  const { data: matches } = await supabase
    .from('match')
    .select('home_team_id, away_team_id, score_home, score_away, match_date')
    .eq('status', 'finished')
    .gte('match_date', threeMonthsAgo.toISOString())
    .or(teamIds.map(id => `home_team_id.eq.${id}`).join(',') + ',' + teamIds.map(id => `away_team_id.eq.${id}`).join(','))
    .order('match_date', { ascending: false })

  if (!matches) return []

  // 3. Calculer la forme pour chaque équipe
  return teams.map(team => {
    const teamMatches = matches
      .filter(m => m.home_team_id === team.id || m.away_team_id === team.id)
      .slice(0, 5)

    const form = teamMatches.map(m => {
      const isHome   = m.home_team_id === team.id
      const scored   = isHome ? m.score_home : m.score_away
      const conceded = isHome ? m.score_away : m.score_home
      if (scored == null || conceded == null) return 'D'
      if (scored > conceded) return 'W'
      if (scored < conceded) return 'L'
      return 'D'
    }).join('')

    return {
      teamId:    team.id,
      name:      team.name,
      shortName: team.short_name || team.name.substring(0, 3).toUpperCase(),
      logoUrl:   team.logo_url || '',
      league:    team.league,
      form,
    }
  }).filter(t => t.form.length > 0)
}

// ─── Joueurs ──────────────────────────────────────────────────────────────────

export async function getAbsentPlayersByTeam(teamId: number): Promise<Player[]> {
  const { data, error } = await supabase
    .from('player')
    .select('id, name, position')
    .eq('team_id', teamId)
    .eq('is_absent', true)
    .order('position')

  if (error || !data) return []
  return data.map(p => ({ id: p.id, name: p.name, position: p.position ?? null, nationality: null, shirtNumber: null, photoUrl: null }))
}

export async function getPlayersByTeam(teamId: number): Promise<Player[]> {
  const { data, error } = await supabase
    .from('player')
    .select('id, name, position')
    .eq('team_id', teamId)
    .order('position')

  if (error || !data) return []
  return data.map(p => ({ id: p.id, name: p.name, position: p.position ?? null, nationality: null, shirtNumber: null, photoUrl: null }))
}
