'use client'

import { Header } from '@/components/header'
import { LeagueSelector } from '@/components/league-selector'
import { mockMatches, getConfidenceLabel } from '@/lib/mock-data'
import { LEAGUES } from '@/lib/types'
import { useState, useMemo } from 'react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts'
import { TrendingUp, BarChart3, PieChartIcon, Activity } from 'lucide-react'

export default function AnalysesPage() {
  const [selectedLeague, setSelectedLeague] = useState('all')

  const filteredMatches = useMemo(() => {
    if (selectedLeague === 'all') return mockMatches
    const leagueName = LEAGUES.find(l => l.id === selectedLeague)?.name
    return mockMatches.filter(m => m.league === leagueName)
  }, [selectedLeague])

  // Data for confidence distribution
  const confidenceData = useMemo(() => {
    const distribution = {
      'Très fiable (80%+)': 0,
      'Fiable (65-79%)': 0,
      'Modéré (50-64%)': 0,
      'Risqué (<50%)': 0,
    }
    
    filteredMatches.forEach(m => {
      const score = m.confidenceScore || 0
      if (score >= 80) distribution['Très fiable (80%+)']++
      else if (score >= 65) distribution['Fiable (65-79%)']++
      else if (score >= 50) distribution['Modéré (50-64%)']++
      else distribution['Risqué (<50%)']++
    })

    return Object.entries(distribution).map(([name, value]) => ({
      name,
      value,
    }))
  }, [filteredMatches])

  // Data for odds distribution
  const oddsData = useMemo(() => {
    return filteredMatches.map(m => ({
      name: `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`,
      home: m.odds?.home || 0,
      draw: m.odds?.draw || 0,
      away: m.odds?.away || 0,
    })).slice(0, 8)
  }, [filteredMatches])

  // Data for league comparison
  const leagueComparisonData = useMemo(() => {
    return LEAGUES.map(league => {
      const leagueMatches = mockMatches.filter(m => m.league === league.name)
      const avgConfidence = leagueMatches.length > 0
        ? Math.round(leagueMatches.reduce((acc, m) => acc + (m.confidenceScore || 0), 0) / leagueMatches.length)
        : 0
      const avgOdds = leagueMatches.length > 0
        ? (leagueMatches.reduce((acc, m) => acc + (m.odds?.home || 0), 0) / leagueMatches.length).toFixed(2)
        : 0
      
      return {
        name: league.name,
        matchs: leagueMatches.length,
        confiance: avgConfidence,
        cote: parseFloat(avgOdds as string),
      }
    })
  }, [])

  // Radar data for selected league stats
  const radarData = useMemo(() => {
    const stats = filteredMatches.reduce((acc, m) => {
      const confidence = m.confidenceScore || 0
      acc.highConfidence += confidence >= 75 ? 1 : 0
      acc.lowRisk += (m.odds?.home || 0) < 1.8 ? 1 : 0
      acc.highOdds += (m.odds?.away || 0) > 3 ? 1 : 0
      acc.balanced += (m.odds?.home || 0) >= 1.8 && (m.odds?.home || 0) <= 2.5 ? 1 : 0
      acc.homeAdvantage += (m.odds?.home || 0) < (m.odds?.away || 0) ? 1 : 0
      return acc
    }, { highConfidence: 0, lowRisk: 0, highOdds: 0, balanced: 0, homeAdvantage: 0 })

    const total = filteredMatches.length || 1

    return [
      { subject: 'Haute confiance', value: Math.round((stats.highConfidence / total) * 100), fullMark: 100 },
      { subject: 'Faible risque', value: Math.round((stats.lowRisk / total) * 100), fullMark: 100 },
      { subject: 'Cotes élevées', value: Math.round((stats.highOdds / total) * 100), fullMark: 100 },
      { subject: 'Équilibré', value: Math.round((stats.balanced / total) * 100), fullMark: 100 },
      { subject: 'Avantage dom.', value: Math.round((stats.homeAdvantage / total) * 100), fullMark: 100 },
    ]
  }, [filteredMatches])

  const COLORS = ['#22c55e', '#10b981', '#eab308', '#ef4444']

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LeagueSelector 
        selectedLeague={selectedLeague} 
        onLeagueChange={setSelectedLeague} 
      />

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analyses & Statistiques</h1>
            <p className="text-muted-foreground">
              Vue d&apos;ensemble des tendances et statistiques des matchs
            </p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Confidence Distribution Pie Chart */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <PieChartIcon className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Distribution de confiance</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={confidenceData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, value }) => `${value}`}
                >
                  {confidenceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Radar Chart */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Profil des matchs</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                <Radar
                  name="Pourcentage"
                  dataKey="value"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.4}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px'
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Odds Bar Chart */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Comparaison des cotes</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={oddsData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: 'var(--muted-foreground)' }} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  width={100}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--foreground)'
                  }}
                />
                <Legend />
                <Bar dataKey="home" name="1 (Dom)" fill="#22c55e" radius={[0, 4, 4, 0]} />
                <Bar dataKey="draw" name="X (Nul)" fill="#eab308" radius={[0, 4, 4, 0]} />
                <Bar dataKey="away" name="2 (Ext)" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* League Comparison Line Chart */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Comparaison par championnat</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={leagueComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fill: 'var(--muted-foreground)' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--foreground)'
                  }}
                />
                <Legend />
                <Bar dataKey="matchs" name="Nb matchs" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="confiance" name="Confiance moy." fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Recommendations Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Meilleures recommandations</h3>
            <p className="text-sm text-muted-foreground">
              Matchs avec le meilleur rapport risque/rendement
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Match</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Championnat</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Cote 1</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Cote X</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Cote 2</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Confiance</th>
                  <th className="text-center p-4 text-sm font-medium text-muted-foreground">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches
                  .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
                  .slice(0, 5)
                  .map((match) => {
                    const confidence = getConfidenceLabel(match.confidenceScore || 0)
                    return (
                      <tr key={match.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="p-4">
                          <span className="font-medium text-foreground">
                            {match.homeTeam.name} vs {match.awayTeam.name}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">{match.league}</td>
                        <td className="p-4 text-center">
                          <span className="px-2 py-1 bg-[var(--odds-bg)] rounded text-sm font-bold text-foreground">
                            {match.odds?.home.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="px-2 py-1 bg-[var(--odds-bg)] rounded text-sm font-bold text-foreground">
                            {match.odds?.draw.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="px-2 py-1 bg-[var(--odds-bg)] rounded text-sm font-bold text-foreground">
                            {match.odds?.away.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`font-bold ${confidence.color}`}>
                            {match.confidenceScore}%
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${confidence.color} bg-current/10`}>
                            {confidence.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
