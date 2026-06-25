"""
Vérifie la cohérence entre la table odds et la table match dans Supabase.
Utilisation : python data/check_db_odds.py
"""
import os
from supabase import create_client
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# 1. Tous les matchs upcoming
matches = supabase.table("match") \
    .select("id, league, match_date, home_team:home_team_id(name), away_team:away_team_id(name)") \
    .eq("status", "upcoming") \
    .order("match_date") \
    .execute().data

print(f"=== {len(matches)} matchs 'upcoming' en base ===\n")

match_ids = [m["id"] for m in matches]

# 2. Toutes les cotes pour ces matchs
odds = supabase.table("odds").select("match_id, bookmaker").in_("match_id", match_ids).execute().data

# Grouper les bookmakers par match
bk_by_match = defaultdict(list)
for o in odds:
    bk_by_match[o["match_id"]].append(o["bookmaker"])

# 3. Afficher
print(f"{'Match':<45} {'Date':<12} {'Bookmakers'}")
print("-" * 90)
for m in matches:
    label = f"{m['home_team']['name'][:18]} vs {m['away_team']['name'][:18]}"
    date  = m["match_date"][:10]
    bks   = bk_by_match.get(m["id"], [])
    bk_str = f"{len(bks)} bookmakers: {', '.join(bks[:3])}{'...' if len(bks) > 3 else ''}" if bks else "AUCUNE COTE"
    print(f"{label:<45} {date:<12} {bk_str}")

# 4. Cotes orphelines (match_id pas dans upcoming)
all_odds = supabase.table("odds").select("match_id, bookmaker").execute().data
orphan_ids = set(o["match_id"] for o in all_odds) - set(match_ids)
if orphan_ids:
    print(f"\n⚠️  {len(orphan_ids)} match_id(s) dans odds mais PAS dans upcoming: {orphan_ids}")
    print("   → Ces cotes ne sont jamais affichées dans l'app.")
