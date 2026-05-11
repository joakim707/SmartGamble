import { Match } from './types'

// Mock data for demonstration - will be replaced with Supabase data
export const mockMatches: Match[] = [
  {
    id: 1,
    homeTeam: {
      id: 1,
      name: 'Paris Saint-Germain',
      shortName: 'PSG',
      logoUrl: 'https://crests.football-data.org/524.png',
      league: 'Ligue 1'
    },
    awayTeam: {
      id: 2,
      name: 'Olympique de Marseille',
      shortName: 'OM',
      logoUrl: 'https://crests.football-data.org/516.png',
      league: 'Ligue 1'
    },
    league: 'Ligue 1',
    matchDate: '2026-05-12T21:00:00Z',
    status: 'upcoming',
    homeForm: 'WWDWW',
    awayForm: 'WDLWW',
    confidenceScore: 85,
    odds: {
      home: 1.45,
      draw: 4.50,
      away: 6.20,
      bookmakers: [
        { name: 'Bet365', home: 1.44, draw: 4.50, away: 6.25 },
        { name: 'Winamax', home: 1.46, draw: 4.45, away: 6.15 },
        { name: 'Betclic', home: 1.45, draw: 4.55, away: 6.20 },
        { name: 'Unibet', home: 1.43, draw: 4.50, away: 6.30 },
      ]
    }
  },
  {
    id: 2,
    homeTeam: {
      id: 3,
      name: 'Olympique Lyonnais',
      shortName: 'OL',
      logoUrl: 'https://crests.football-data.org/523.png',
      league: 'Ligue 1'
    },
    awayTeam: {
      id: 4,
      name: 'AS Monaco',
      shortName: 'ASM',
      logoUrl: 'https://crests.football-data.org/548.png',
      league: 'Ligue 1'
    },
    league: 'Ligue 1',
    matchDate: '2026-05-12T19:00:00Z',
    status: 'upcoming',
    homeForm: 'WDWLW',
    awayForm: 'WWWDW',
    confidenceScore: 72,
    odds: {
      home: 2.30,
      draw: 3.40,
      away: 2.95,
      bookmakers: [
        { name: 'Bet365', home: 2.28, draw: 3.45, away: 2.90 },
        { name: 'Winamax', home: 2.32, draw: 3.35, away: 2.98 },
        { name: 'Betclic', home: 2.30, draw: 3.40, away: 2.95 },
      ]
    }
  },
  {
    id: 3,
    homeTeam: {
      id: 5,
      name: 'LOSC Lille',
      shortName: 'LOSC',
      logoUrl: 'https://crests.football-data.org/521.png',
      league: 'Ligue 1'
    },
    awayTeam: {
      id: 6,
      name: 'Stade Rennais',
      shortName: 'SRFC',
      logoUrl: 'https://crests.football-data.org/529.png',
      league: 'Ligue 1'
    },
    league: 'Ligue 1',
    matchDate: '2026-05-13T17:00:00Z',
    status: 'upcoming',
    homeForm: 'DWWLW',
    awayForm: 'LDWDL',
    confidenceScore: 68,
    odds: {
      home: 1.85,
      draw: 3.60,
      away: 4.00,
      bookmakers: [
        { name: 'Bet365', home: 1.83, draw: 3.60, away: 4.05 },
        { name: 'Winamax', home: 1.87, draw: 3.55, away: 3.95 },
      ]
    }
  },
  {
    id: 4,
    homeTeam: {
      id: 7,
      name: 'Real Madrid',
      shortName: 'RMA',
      logoUrl: 'https://crests.football-data.org/86.png',
      league: 'La Liga'
    },
    awayTeam: {
      id: 8,
      name: 'FC Barcelona',
      shortName: 'BAR',
      logoUrl: 'https://crests.football-data.org/81.png',
      league: 'La Liga'
    },
    league: 'La Liga',
    matchDate: '2026-05-14T21:00:00Z',
    status: 'upcoming',
    homeForm: 'WWWWW',
    awayForm: 'WDWWW',
    confidenceScore: 78,
    odds: {
      home: 2.10,
      draw: 3.50,
      away: 3.30,
      bookmakers: [
        { name: 'Bet365', home: 2.08, draw: 3.55, away: 3.28 },
        { name: 'Winamax', home: 2.12, draw: 3.45, away: 3.32 },
        { name: 'Betclic', home: 2.10, draw: 3.50, away: 3.30 },
      ]
    }
  },
  {
    id: 5,
    homeTeam: {
      id: 9,
      name: 'Atlético Madrid',
      shortName: 'ATM',
      logoUrl: 'https://crests.football-data.org/78.png',
      league: 'La Liga'
    },
    awayTeam: {
      id: 10,
      name: 'Sevilla FC',
      shortName: 'SEV',
      logoUrl: 'https://crests.football-data.org/559.png',
      league: 'La Liga'
    },
    league: 'La Liga',
    matchDate: '2026-05-14T19:00:00Z',
    status: 'upcoming',
    homeForm: 'WDWWD',
    awayForm: 'LLDWL',
    confidenceScore: 82,
    odds: {
      home: 1.55,
      draw: 4.00,
      away: 5.50,
      bookmakers: [
        { name: 'Bet365', home: 1.53, draw: 4.05, away: 5.55 },
        { name: 'Winamax', home: 1.57, draw: 3.95, away: 5.45 },
      ]
    }
  },
  {
    id: 6,
    homeTeam: {
      id: 11,
      name: 'Manchester City',
      shortName: 'MCI',
      logoUrl: 'https://crests.football-data.org/65.png',
      league: 'Premier League'
    },
    awayTeam: {
      id: 12,
      name: 'Liverpool FC',
      shortName: 'LIV',
      logoUrl: 'https://crests.football-data.org/64.png',
      league: 'Premier League'
    },
    league: 'Premier League',
    matchDate: '2026-05-15T17:30:00Z',
    status: 'upcoming',
    homeForm: 'WWWDW',
    awayForm: 'WDWWW',
    confidenceScore: 75,
    odds: {
      home: 1.90,
      draw: 3.80,
      away: 3.60,
      bookmakers: [
        { name: 'Bet365', home: 1.88, draw: 3.85, away: 3.55 },
        { name: 'Winamax', home: 1.92, draw: 3.75, away: 3.65 },
        { name: 'Unibet', home: 1.90, draw: 3.80, away: 3.60 },
      ]
    }
  },
  {
    id: 7,
    homeTeam: {
      id: 13,
      name: 'Arsenal FC',
      shortName: 'ARS',
      logoUrl: 'https://crests.football-data.org/57.png',
      league: 'Premier League'
    },
    awayTeam: {
      id: 14,
      name: 'Chelsea FC',
      shortName: 'CHE',
      logoUrl: 'https://crests.football-data.org/61.png',
      league: 'Premier League'
    },
    league: 'Premier League',
    matchDate: '2026-05-15T15:00:00Z',
    status: 'upcoming',
    homeForm: 'WWWWL',
    awayForm: 'WDWDW',
    confidenceScore: 70,
    odds: {
      home: 1.75,
      draw: 3.80,
      away: 4.20,
      bookmakers: [
        { name: 'Bet365', home: 1.73, draw: 3.85, away: 4.25 },
        { name: 'Winamax', home: 1.77, draw: 3.75, away: 4.15 },
      ]
    }
  },
  {
    id: 8,
    homeTeam: {
      id: 15,
      name: 'Bayern Munich',
      shortName: 'FCB',
      logoUrl: 'https://crests.football-data.org/5.png',
      league: 'Bundesliga'
    },
    awayTeam: {
      id: 16,
      name: 'Borussia Dortmund',
      shortName: 'BVB',
      logoUrl: 'https://crests.football-data.org/4.png',
      league: 'Bundesliga'
    },
    league: 'Bundesliga',
    matchDate: '2026-05-16T18:30:00Z',
    status: 'upcoming',
    homeForm: 'WWWWW',
    awayForm: 'WDWLW',
    confidenceScore: 88,
    odds: {
      home: 1.40,
      draw: 5.00,
      away: 6.50,
      bookmakers: [
        { name: 'Bet365', home: 1.38, draw: 5.10, away: 6.55 },
        { name: 'Winamax', home: 1.42, draw: 4.90, away: 6.45 },
      ]
    }
  },
  {
    id: 9,
    homeTeam: {
      id: 17,
      name: 'Juventus FC',
      shortName: 'JUV',
      logoUrl: 'https://crests.football-data.org/109.png',
      league: 'Serie A'
    },
    awayTeam: {
      id: 18,
      name: 'AC Milan',
      shortName: 'MIL',
      logoUrl: 'https://crests.football-data.org/98.png',
      league: 'Serie A'
    },
    league: 'Serie A',
    matchDate: '2026-05-17T20:45:00Z',
    status: 'upcoming',
    homeForm: 'DWWDW',
    awayForm: 'WLWWL',
    confidenceScore: 65,
    odds: {
      home: 2.00,
      draw: 3.30,
      away: 3.70,
      bookmakers: [
        { name: 'Bet365', home: 1.98, draw: 3.35, away: 3.65 },
        { name: 'Winamax', home: 2.02, draw: 3.25, away: 3.75 },
      ]
    }
  },
  {
    id: 10,
    homeTeam: {
      id: 19,
      name: 'Inter Milan',
      shortName: 'INT',
      logoUrl: 'https://crests.football-data.org/108.png',
      league: 'Serie A'
    },
    awayTeam: {
      id: 20,
      name: 'SSC Napoli',
      shortName: 'NAP',
      logoUrl: 'https://crests.football-data.org/113.png',
      league: 'Serie A'
    },
    league: 'Serie A',
    matchDate: '2026-05-17T18:00:00Z',
    status: 'upcoming',
    homeForm: 'WWWWD',
    awayForm: 'DWWWW',
    confidenceScore: 73,
    odds: {
      home: 1.95,
      draw: 3.50,
      away: 3.80,
      bookmakers: [
        { name: 'Bet365', home: 1.93, draw: 3.55, away: 3.75 },
        { name: 'Winamax', home: 1.97, draw: 3.45, away: 3.85 },
      ]
    }
  },
]

export function getMatchesByLeague(league: string): Match[] {
  if (league === 'all') return mockMatches
  return mockMatches.filter(m => m.league === league)
}

export function getMatchesByDate(date: Date): Match[] {
  const dateStr = date.toISOString().split('T')[0]
  return mockMatches.filter(m => m.matchDate.startsWith(dateStr))
}

export function formatMatchDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatMatchTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function groupMatchesByLeague(matches: Match[]): Record<string, Match[]> {
  return matches.reduce((acc, match) => {
    if (!acc[match.league]) {
      acc[match.league] = []
    }
    acc[match.league].push(match)
    return acc
  }, {} as Record<string, Match[]>)
}

export function groupMatchesByDate(matches: Match[]): Record<string, Match[]> {
  return matches.reduce((acc, match) => {
    const date = match.matchDate.split('T')[0]
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(match)
    return acc
  }, {} as Record<string, Match[]>)
}

export function getConfidenceLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Très fiable', color: 'text-green-400' }
  if (score >= 65) return { label: 'Fiable', color: 'text-emerald-400' }
  if (score >= 50) return { label: 'Modéré', color: 'text-yellow-400' }
  return { label: 'Risqué', color: 'text-red-400' }
}

export function getBestOdds(match: Match): { type: '1' | 'X' | '2'; odds: number; bookmaker: string } | null {
  if (!match.odds?.bookmakers.length) return null
  
  let best = { type: '1' as const, odds: 0, bookmaker: '' }
  
  for (const bk of match.odds.bookmakers) {
    if (bk.home > best.odds) {
      best = { type: '1', odds: bk.home, bookmaker: bk.name }
    }
    if (bk.draw > best.odds) {
      best = { type: 'X', odds: bk.draw, bookmaker: bk.name }
    }
    if (bk.away > best.odds) {
      best = { type: '2', odds: bk.away, bookmaker: bk.name }
    }
  }
  
  return best
}
