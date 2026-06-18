"""
Récupère les joueurs ayant participé à chaque match depuis Understat
et les stocke dans les tables 'player' et 'lineup' de Supabase.

Understat fournit, pour chaque match terminé, la liste des joueurs des deux équipes
avec leur position, minutes jouées et statistiques avancées.

Flow : pour chaque match terminé avec un understat_id en BDD
       → appel Understat get_match_players(understat_id)
       → upsert chaque joueur dans 'player' (clé : nom + team_id)
       → upsert dans 'lineup' (match_id, player_id, is_starter=True, is_absent=False)
       → on ignore les matchs qui ont déjà une composition en BDD

Note : Understat ne distingue pas titulaires et remplaçants.
       Tous les joueurs sont insérés avec is_starter=True.
"""

import asyncio
import os

import aiohttp
from understat import Understat
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ================================
# Configuration
# ================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mapping des codes de position Understat vers des libellés lisibles
# Understat utilise : GKP (gardien), DEF (défenseur), MID (milieu), FWD (attaquant)
POSITION_MAP = {
    "GKP": "Goalkeeper",
    "GK":  "Goalkeeper",
    "DEF": "Defender",
    "DF":  "Defender",
    "MID": "Midfielder",
    "MF":  "Midfielder",
    "FWD": "Forward",
    "FW":  "Forward",
    "AMF": "Midfielder",   # Milieu offensif
    "DMF": "Midfielder",   # Milieu défensif
}


# ================================
# Helpers Supabase
# ================================

def upsert_joueur(nom: str, team_id: int, position: str | None) -> int | None:
    """
    Insère le joueur s'il n'existe pas encore pour cette équipe, ou retourne son id.
    La clé de recherche est (nom, team_id) — Understat n'a pas de sofascore_id.
    Retourne l'id Supabase du joueur, ou None si le nom est vide.
    """
    if not nom:
        return None

    # On cherche si ce joueur existe déjà dans cette équipe
    existant = (
        supabase.table("player")
        .select("id")
        .eq("name", nom)
        .eq("team_id", team_id)
        .execute()
    )
    if existant.data:
        # Joueur déjà connu → on retourne son id sans créer de doublon
        return existant.data[0]["id"]

    # Nouveau joueur → insertion
    result = supabase.table("player").insert({
        "name":     nom,
        "team_id":  team_id,
        "position": position,
    }).execute()

    if not result.data:
        return None
    return result.data[0]["id"]


def upsert_lineup(match_id: int, team_id: int, player_id: int) -> None:
    """
    Insère ou met à jour une entrée dans la table lineup.

    Tous les joueurs Understat sont marqués is_starter=True et is_absent=False
    car Understat ne distingue pas les titulaires des remplaçants :
    il liste uniquement les joueurs qui ont effectivement joué.
    """
    supabase.table("lineup").upsert(
        {
            "match_id":   match_id,
            "team_id":    team_id,
            "player_id":  player_id,
            "is_starter": True,   # Convention : tous les joueurs Understat sont titulaires
            "is_absent":  False,  # Understat ne liste que les joueurs ayant joué
        },
        on_conflict="match_id,team_id,player_id",
    ).execute()


def get_ids_matchs_deja_traites() -> set[int]:
    """
    Retourne les match_id qui ont déjà au moins un joueur en lineup.
    Permet d'éviter de retraiter des matchs déjà importés.
    On pagine par blocs de 1000 car Supabase limite les résultats par requête.
    """
    deja_faits: set[int] = set()
    offset = 0

    while True:
        # Récupération d'un bloc de 1000 entrées de lineup
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
        # Si on a reçu moins de 1000 résultats, on a atteint la fin de la table
        if len(page.data) < 1000:
            break
        offset += 1000

    return deja_faits


# ================================
# Fetch composition via Understat
# ================================

async def process_match(session: aiohttp.ClientSession, match_row: dict) -> None:
    """
    Récupère et stocke les joueurs d'un match depuis Understat.

    get_match_players(understat_id) retourne :
    {
        "h": { "id_joueur": { "player_name": "...", "position": "GKP", ... } },
        "a": { "id_joueur": { "player_name": "...", "position": "MID", ... } }
    }
    "h" = équipe domicile, "a" = équipe extérieure.
    """
    match_id     = match_row["id"]
    understat_id = int(match_row["understat_id"])   # Understat attend un entier
    home_team_id = match_row["home_team_id"]
    away_team_id = match_row["away_team_id"]

    u = Understat(session)
    try:
        # Appel Understat : retourne les joueurs des deux équipes
        joueurs_data = await u.get_match_players(understat_id)
    except Exception as e:
        print(f"    Erreur Understat (match {match_id}, understat:{understat_id}): {e}")
        return

    # Traitement des deux côtés du terrain
    for cote, team_id in [("h", home_team_id), ("a", away_team_id)]:
        joueurs_cote = joueurs_data.get(cote, {})

        # La lib Understat retourne soit un dict {id: données} soit une liste
        # On gère les deux cas pour être robuste face aux changements de l'API
        if isinstance(joueurs_cote, list):
            iterable = joueurs_cote
        else:
            # Dict : on itère sur les valeurs (on n'a pas besoin des clés/id Understat)
            iterable = joueurs_cote.values()

        for joueur in iterable:
            nom      = joueur.get("player_name", "")
            pos_code = joueur.get("position", "")
            # On traduit le code position en libellé lisible, ou on garde le code si inconnu
            position = POSITION_MAP.get(pos_code, pos_code if pos_code else None)

            # Upsert du joueur puis de son entrée en lineup
            player_id = upsert_joueur(nom, team_id, position)
            if player_id:
                upsert_lineup(match_id, team_id, player_id)

    print(f"    OK — compo importée (understat:{understat_id})")


# ================================
# Point d'entrée
# ================================

async def run() -> None:
    """
    Parcourt tous les matchs terminés avec understat_id et récupère leurs compositions.
    Les matchs qui ont déjà une composition en BDD sont ignorés pour éviter
    de refaire un travail déjà accompli.
    """
    # Récupération de tous les matchs terminés ayant un identifiant Understat
    result = (
        supabase.table("match")
        .select("id, understat_id, home_team_id, away_team_id, league")
        .filter("understat_id", "not.is", "null")
        .eq("status", "finished")
        .execute()
    )
    tous_les_matchs = result.data or []
    print(f"\n{len(tous_les_matchs)} matchs terminés avec understat_id")

    # On exclut les matchs qui ont déjà une composition enregistrée
    deja_traites = get_ids_matchs_deja_traites()
    print(f"{len(deja_traites)} matchs déjà importés, ignorés")

    a_traiter = [m for m in tous_les_matchs if m["id"] not in deja_traites]
    print(f"{len(a_traiter)} matchs à traiter\n")

    if not a_traiter:
        print("Rien à faire.")
        return

    async with aiohttp.ClientSession() as session:
        for i, match in enumerate(a_traiter, 1):
            print(f"  [{i}/{len(a_traiter)}] Match {match['id']} (understat:{match['understat_id']})")
            await process_match(session, match)
            # Petite pause entre chaque requête pour ne pas surcharger l'API Understat
            await asyncio.sleep(0.5)

    print("\nCompositions importées !")


if __name__ == "__main__":
    asyncio.run(run())
