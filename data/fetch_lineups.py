"""
Récupère les compositions de match depuis football-data.org
et les stocke dans les tables 'player' et 'lineup' de Supabase.

football-data.org expose les titulaires et remplaçants pour chaque match
terminé via GET /v4/matches/{fd_match_id}.

Limite : 10 requêtes/min sur le tier gratuit → pause de 6s entre chaque match.
Pour ~380 matchs par ligue × 5 ligues, prévoir plusieurs heures d'exécution.
Conseil : lancer sur un sous-ensemble (ex: une ligue) et relancer pour les autres.

Flow : pour chaque match terminé avec fd_match_id en BDD
       → GET https://api.football-data.org/v4/matches/{fd_match_id}
       → upsert chaque joueur (titulaire + remplaçant) dans 'player'
       → upsert dans 'lineup' (match_id, player_id, is_starter, is_absent=False)
"""

import asyncio
import os

import aiohttp
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ================================
# Configuration
# ================================

SUPABASE_URL        = os.getenv("SUPABASE_URL")
SUPABASE_KEY        = os.getenv("SUPABASE_KEY")
FOOTBALL_DATA_TOKEN = os.getenv("FOOTBALL_DATA_API_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Pause entre chaque requête pour respecter la limite de 10 req/min
PAUSE_SECONDES = 6.5

# En-têtes requis par football-data.org
def _headers() -> dict:
    return {"X-Auth-Token": FOOTBALL_DATA_TOKEN}

# Mapping des positions football-data.org vers nos libellés
POSITION_MAP = {
    "Goalkeeper":  "Goalkeeper",
    "Defence":     "Defender",
    "Midfield":    "Midfielder",
    "Offence":     "Forward",
    "Defender":    "Defender",
    "Midfielder":  "Midfielder",
    "Forward":     "Forward",
    "Attacker":    "Forward",
}


# ================================
# Helpers Supabase
# ================================

def upsert_joueur(nom: str, team_id: int, position: str | None) -> int | None:
    """
    Insère le joueur s'il n'existe pas encore pour cette équipe, ou retourne son id.
    Clé de recherche : (nom, team_id) — on évite les doublons par joueur.
    Retourne None si le nom est vide.
    """
    if not nom:
        return None

    existant = (
        supabase.table("player")
        .select("id")
        .eq("name", nom)
        .eq("team_id", team_id)
        .execute()
    )
    if existant.data:
        return existant.data[0]["id"]

    result = supabase.table("player").insert({
        "name":     nom,
        "team_id":  team_id,
        "position": position,
    }).execute()

    return result.data[0]["id"] if result.data else None


def upsert_lineup(match_id: int, team_id: int, player_id: int, is_starter: bool) -> None:
    """
    Insère ou met à jour une entrée en lineup.
    is_starter=True pour les titulaires, False pour les remplaçants.
    is_absent=False car football-data.org ne liste que les joueurs ayant participé.
    """
    supabase.table("lineup").upsert(
        {
            "match_id":   match_id,
            "team_id":    team_id,
            "player_id":  player_id,
            "is_starter": is_starter,
            "is_absent":  False,
        },
        on_conflict="match_id,team_id,player_id",
    ).execute()


def get_ids_matchs_deja_traites() -> set[int]:
    """
    Retourne les match_id qui ont déjà au moins un joueur en lineup.
    Pagine par blocs de 1000 pour contourner la limite Supabase.
    """
    deja_faits: set[int] = set()
    offset = 0
    while True:
        page = (
            supabase.table("lineup")
            .select("match_id")
            .range(offset, offset + 999)
            .execute()
        )
        if not page.data:
            break
        for row in page.data:
            deja_faits.add(row["match_id"])
        if len(page.data) < 1000:
            break
        offset += 1000
    return deja_faits


# ================================
# Fetch composition via football-data.org
# ================================

async def process_match(session: aiohttp.ClientSession, match_row: dict) -> bool:
    """
    Récupère et stocke la composition d'un match depuis football-data.org.

    GET /v4/matches/{fd_match_id} retourne :
    {
      "homeTeam": {"lineup": [...joueurs], "bench": [...remplaçants]},
      "awayTeam": {"lineup": [...joueurs], "bench": [...remplaçants]}
    }
    Chaque joueur : {"name": "...", "position": "Midfielder", "shirtNumber": 8}
    """
    match_id    = match_row["id"]
    fd_match_id = match_row["fd_match_id"]
    home_team_id = match_row["home_team_id"]
    away_team_id = match_row["away_team_id"]

    url = f"https://api.football-data.org/v4/matches/{fd_match_id}"

    for tentative in range(1, 4):
        try:
            async with session.get(url, headers=_headers()) as resp:
                if resp.status != 200:
                    print(f"    Erreur {resp.status} pour fd_match:{fd_match_id}")
                    return False
                data = await resp.json()
            break
        except aiohttp.ClientError as e:
            if tentative == 3:
                print(f"    Échec après 3 tentatives : {e}")
                return False
            print(f"    Tentative {tentative}/3 échouée ({e}), retry dans 7s...")
            await asyncio.sleep(7)

    # Traitement des deux équipes
    for cote, team_id in [("homeTeam", home_team_id), ("awayTeam", away_team_id)]:
        equipe_data = data.get(cote, {})

        # Titulaires (lineup) : is_starter=True
        for joueur in equipe_data.get("lineup", []):
            nom      = joueur.get("name", "")
            pos_raw  = joueur.get("position", "")
            position = POSITION_MAP.get(pos_raw, pos_raw if pos_raw else None)
            pid = upsert_joueur(nom, team_id, position)
            if pid:
                upsert_lineup(match_id, team_id, pid, is_starter=True)

        # Remplaçants (bench) : is_starter=False
        for joueur in equipe_data.get("bench", []):
            nom      = joueur.get("name", "")
            pos_raw  = joueur.get("position", "")
            position = POSITION_MAP.get(pos_raw, pos_raw if pos_raw else None)
            pid = upsert_joueur(nom, team_id, position)
            if pid:
                upsert_lineup(match_id, team_id, pid, is_starter=False)

    print(f"    OK — compo importée (fd_match:{fd_match_id})")
    return True


# ================================
# Point d'entrée
# ================================

async def run(leagues_filter: list[str] | None = None) -> None:
    """
    Parcourt les matchs terminés avec fd_match_id et importe leurs compositions.
    Les matchs déjà traités sont ignorés. Pause de 6.5s entre chaque requête
    pour respecter la limite de 10 req/min de football-data.org tier gratuit.
    """
    if not FOOTBALL_DATA_TOKEN:
        print("ERREUR : FOOTBALL_DATA_API_KEY manquant dans le .env")
        return

    # Matchs terminés ayant un fd_match_id
    result = (
        supabase.table("match")
        .select("id, fd_match_id, home_team_id, away_team_id, league")
        .filter("fd_match_id", "not.is", "null")
        .eq("status", "finished")
        .execute()
    )
    tous_les_matchs = result.data or []
    print(f"\n{len(tous_les_matchs)} matchs terminés avec fd_match_id")

    # Filtre les matchs déjà importés
    deja_traites = get_ids_matchs_deja_traites()
    print(f"{len(deja_traites)} matchs déjà importés, ignorés")

    a_traiter = [m for m in tous_les_matchs if m["id"] not in deja_traites]

    if leagues_filter:
        a_traiter = [m for m in a_traiter if m["league"] in leagues_filter]
        print(f"Filtre ligues : {', '.join(leagues_filter)}")

    # Prioriser les ligues peu couvertes pour ne pas s'arrêter avant de les atteindre
    PRIORITY = ["Ligue 1", "Serie A", "Bundesliga", "La Liga", "Premier League"]
    a_traiter.sort(key=lambda m: PRIORITY.index(m["league"]) if m["league"] in PRIORITY else 99)

    print(f"{len(a_traiter)} matchs à traiter")
    for lg in PRIORITY:
        n = sum(1 for m in a_traiter if m["league"] == lg)
        if n: print(f"  {lg}: {n} matchs")
    print(f"Durée estimée : ~{len(a_traiter) * PAUSE_SECONDES / 60:.0f} min (limite 10 req/min)\n")

    if not a_traiter:
        print("Rien à faire.")
        return

    async with aiohttp.ClientSession() as session:
        for i, match in enumerate(a_traiter, 1):
            print(f"  [{i}/{len(a_traiter)}] Match {match['id']} (fd:{match['fd_match_id']})")
            await process_match(session, match)
            # Pause obligatoire entre chaque requête (limite 10 req/min du tier gratuit)
            await asyncio.sleep(PAUSE_SECONDES)

    print("\nCompositions importées !")


if __name__ == "__main__":
    import sys
    # Usage optionnel : python fetch_lineups.py "Ligue 1" "Serie A"
    leagues_filter = sys.argv[1:] if len(sys.argv) > 1 else None
    asyncio.run(run(leagues_filter))
