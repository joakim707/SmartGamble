import { supabase } from './supabase'
import { Match, Player } from './types'

export type Period = 'week' | 'month'

// ── Helpers période ──────────────────────────────────────────────────────────

/** Retourne les bornes ISO (from/to) d'une période autour d'une date de référence. */
export function getPeriodBounds(period: Period, refDate: Date): { from: string; to: string } {
  const d = new Date(refDate)

  if (period === 'week') {
    // Semaine lundi→dimanche contenant refDate
    const day  = d.getDay() === 0 ? 7 : d.getDay() // 1=lun … 7=dim
    const mon  = new Date(d); mon.setDate(d.getDate() - (day - 1)); mon.setHours(0, 0, 0, 0)
    const sun  = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999)
    return { from: mon.toISOString(), to: sun.toISOString() }
  } else {
    // Mois calendaire contenant refDate
    const from = new Date(d.getFullYear(), d.getMonth(), 1)
    const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    return { from: from.toISOString(), to: to.toISOString() }
  }
}

/** Décale refDate d'une semaine ou d'un mois dans la direction donnée. */
export function shiftDate(date: Date, period: Period, direction: 1 | -1): Date {
  const d = new Date(date)
  if (period === 'week') {
    d.setDate(d.getDate() + direction * 7)
  } else {
    d.setMonth(d.getMonth() + direction)
  }
  return d
}

/** Label lisible pour la période affichée dans le sélecteur. */
export function formatPeriodLabel(period: Period, refDate: Date): string {
  if (period === 'week') {
    const { from, to } = getPeriodBounds('week', refDate)
    const f = new Date(from)
    const t = new Date(to)
    return `${f.getDate()} – ${t.getDate()} ${t.toLocaleDateString('fr-FR', { month: 'long' })}`
  } else {
    return refDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }
}

// ── Match date la plus récente ───────────────────────────────────────────────

/** Retourne la date du dernier match disponible en BDD (pour initialiser le sélecteur). */
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

// ── Helper mapping ligne DB → Match ─────────────────────────────────────────

function rowToMatch(m: any): Match {
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
  }
}

// ── Matchs filtrés par période ───────────────────────────────────────────────

export async function getMatches(
  league: string | null,
  period: Period,
  refDate: Date,
): Promise<Match[]> {
  const { from, to } = getPeriodBounds(period, refDate)

  let query = supabase
    .from('match')
    .select(`
      id, match_date, status, league, score_home, score_away, fd_match_id,
      home_team:home_team_id(id, name, short_name, logo_url),
      away_team:away_team_id(id, name, short_name, logo_url)
    `)
    .not('fd_match_id', 'is', null)
    .gte('match_date', from)
    .lte('match_date', to)
    .in('status', ['finished', 'upcoming', 'live'])
    .order('match_date', { ascending: true })

  if (league) {
    query = query.eq('league', league)
  } else {
    query = query.in('league', ['Ligue 1', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A'])
  }

  const { data, error } = await query

  if (error || !data) {
    console.error('Erreur Supabase (matchs):', error)
    return []
  }

  return data.map(rowToMatch)
}

// ── Forme des équipes ────────────────────────────────────────────────────────

export interface TeamForm {
  teamId:    number
  name:      string
  shortName: string
  logoUrl:   string
  league:    string
  form:      string
}

export async function getTeamForms(league?: string): Promise<TeamForm[]> {
  // Récupérer toutes les équipes de la ligue
  let teamQuery = supabase
    .from('team')
    .select('id, name, short_name, logo_url, league')

  if (league) {
    teamQuery = teamQuery.eq('league', league)
  } else {
    teamQuery = teamQuery.in('league', ['Ligue 1', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A'])
  }

  const { data: teams } = await teamQuery
  if (!teams || teams.length === 0) return []

  const teamIds = teams.map(t => t.id)

  // Récupérer les 5 derniers matchs terminés pour chaque équipe d'un coup
  const { data: recentMatches } = await supabase
    .from('match')
    .select('id, home_team_id, away_team_id, score_home, score_away, match_date')
    .or(teamIds.map(id => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(','))
    .eq('status', 'finished')
    .not('score_home', 'is', null)
    .not('fd_match_id', 'is', null)
    .order('match_date', { ascending: false })
    .limit(500)

  // Grouper les matchs par équipe et calculer la forme
  const matchesByTeam = new Map<number, typeof recentMatches>()
  for (const teamId of teamIds) {
    const teamMatches = (recentMatches ?? [])
      .filter(m => m.home_team_id === teamId || m.away_team_id === teamId)
      .slice(0, 5)
    matchesByTeam.set(teamId, teamMatches)
  }

  return teams.map(team => {
    const lastMatches = matchesByTeam.get(team.id) ?? []
    const form = lastMatches
      .map(m => {
        const isHome   = m.home_team_id === team.id
        const teamGoals = isHome ? m.score_home! : m.score_away!
        const oppGoals  = isHome ? m.score_away! : m.score_home!
        if (teamGoals > oppGoals) return 'W'
        if (teamGoals < oppGoals) return 'L'
        return 'D'
      })
      .join('')

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

// ── Joueurs absents / effectif ───────────────────────────────────────────────

export async function getAbsentPlayersByTeam(teamId: number): Promise<Player[]> {
  const { data, error } = await supabase
    .from('lineup')
    .select('player:player_id(id, name, position)')
    .eq('team_id', teamId)
    .eq('is_absent', true)

  if (error || !data) return []

  return (data as any[])
    .filter(r => r.player)
    .map(r => ({
      id:          r.player.id,
      name:        r.player.name,
      position:    r.player.position ?? null,
      nationality: null,
      shirtNumber: null,
      photoUrl:    null,
    }))
}

export async function getPlayersByTeam(teamId: number): Promise<Player[]> {
  const { data, error } = await supabase
    .from('player')
    .select('id, name, position')
    .eq('team_id', teamId)
    .order('position')

  if (error || !data) return []

  return data.map(p => ({
    id:          p.id,
    name:        p.name,
    position:    p.position ?? null,
    nationality: null,
    shirtNumber: null,
    photoUrl:    null,
  }))
}
