export interface Team {
  id: number
  name: string
  shortName: string
  logoUrl: string
  league: string
}

export interface Player {
  id: number
  name: string
  position: string | null
  nationality: string | null
  shirtNumber: number | null
  photoUrl: string | null
}

export interface Match {
  id: number
  homeTeam: Team
  awayTeam: Team
  league: string
  matchDate: string
  status: 'upcoming' | 'live' | 'finished' | 'cancelled'
  scoreHome?: number
  scoreAway?: number
  odds?: MatchOdds
  confidenceScore?: number
  homeForm?: string
  awayForm?: string
}

export interface MatchOdds {
  home: number
  draw: number
  away: number
  bookmakers: BookmakerOdds[]
}

export interface BookmakerOdds {
  name: string
  home: number
  draw: number
  away: number
}

export interface League {
  id: string
  name: string
  country: string
  flag: string
  logo: string
}

export const LEAGUES: League[] = [
  { id: 'ligue1',      name: 'Ligue 1',        country: 'France',  flag: '🇫🇷', logo: '/leagues/ligue1.png' },
  { id: 'premier',     name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', logo: '/leagues/premier.png' },
  { id: 'laliga',      name: 'La Liga',        country: 'Spain',   flag: '🇪🇸', logo: '/leagues/laliga.png' },
  { id: 'bundesliga',  name: 'Bundesliga',     country: 'Germany', flag: '🇩🇪', logo: '/leagues/bundesliga.png' },
  { id: 'seriea',      name: 'Serie A',        country: 'Italy',   flag: '🇮🇹', logo: '/leagues/seriea.png' },
]

export type RiskLevel = 'low' | 'medium' | 'high'
