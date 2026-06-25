import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";

type Player = { id: number; name: string; position: string | null };
type LineupEntry = { is_starter: boolean; player: Player };
type TeamLineup = { starters: Player[]; bench: Player[] };

async function getMatch(id: number) {
  const { data } = await supabase
    .from("match")
    .select(`
      id, match_date, status, score_home, score_away, league,
      home_team:home_team_id(id, name),
      away_team:away_team_id(id, name)
    `)
    .eq("id", id)
    .single();
  return data as unknown as {
    id: number; match_date: string; status: string;
    score_home: number | null; score_away: number | null; league: string;
    home_team: { id: number; name: string };
    away_team: { id: number; name: string };
  } | null;
}

async function getLineup(matchId: number, teamId: number): Promise<TeamLineup> {
  const { data } = await supabase
    .from("lineup")
    .select("is_starter, player:player_id(id, name, position)")
    .eq("match_id", matchId)
    .eq("team_id", teamId);

  const entries = (data as unknown as LineupEntry[]) ?? [];
  return {
    starters: entries.filter((e) => e.is_starter).map((e) => e.player),
    bench: entries.filter((e) => !e.is_starter).map((e) => e.player),
  };
}

function LineupList({ title, players }: { title: string; players: Player[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">{title}</h3>
      {players.length === 0 ? (
        <p className="text-[var(--muted)] text-sm">—</p>
      ) : (
        <ul className="space-y-1">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-[var(--muted)] w-16 shrink-0">{p.position ?? "—"}</span>
              <span>{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatch(Number(id));
  if (!match) notFound();

  const [homeLineup, awayLineup] = await Promise.all([
    getLineup(match.id, match.home_team.id),
    getLineup(match.id, match.away_team.id),
  ]);

  const dateStr = new Date(match.match_date).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-8 text-center">
        <p className="text-[var(--muted)] text-sm mb-4">{match.league} · {dateStr}</p>
        <div className="flex items-center justify-center gap-8">
          <h1 className="text-2xl font-bold w-48 text-right">{match.home_team.name}</h1>
          <div className="text-4xl font-mono font-black px-6">
            {match.status === "finished"
              ? `${match.score_home} – ${match.score_away}`
              : <span className="text-[var(--muted)]">vs</span>}
          </div>
          <h1 className="text-2xl font-bold w-48 text-left">{match.away_team.name}</h1>
        </div>
      </div>

      {/* Lineups */}
      {(homeLineup.starters.length > 0 || awayLineup.starters.length > 0) && (
        <div className="grid grid-cols-2 gap-6">
          {/* Home */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 space-y-5">
            <h2 className="font-semibold text-center">{match.home_team.name}</h2>
            <LineupList title="Titulaires" players={homeLineup.starters} />
            <LineupList title="Remplaçants" players={homeLineup.bench} />
          </div>
          {/* Away */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 space-y-5">
            <h2 className="font-semibold text-center">{match.away_team.name}</h2>
            <LineupList title="Titulaires" players={awayLineup.starters} />
            <LineupList title="Remplaçants" players={awayLineup.bench} />
          </div>
        </div>
      )}

      {homeLineup.starters.length === 0 && awayLineup.starters.length === 0 && (
        <p className="text-[var(--muted)] text-center">Compositions non disponibles pour ce match.</p>
      )}
    </div>
  );
}
