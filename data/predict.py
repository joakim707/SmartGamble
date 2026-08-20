import os
import pandas as pd
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from supabase import create_client

# 1. Chargement des variables d'environnement
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Erreur : SUPABASE_URL ou SUPABASE_KEY manquant dans le fichier .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

MAPPING_RESULTAT = {2: "Domicile", 1: "Nul", 0: "Exterieur"}


def fetch_finished_matches() -> list[dict]:
    """Récupère tous les matchs terminés depuis Supabase (bruts, non transformés)."""
    try:
        response = supabase.table("match").select("*").eq("status", "finished").execute()
        return response.data or []
    except Exception as e:
        print(f"Erreur lors de la recuperation des matchs : {e}")
        return []


def build_dataframe(matchs: list[dict]) -> pd.DataFrame:
    """
    Transforme les matchs bruts (dicts Supabase) en DataFrame trié
    chronologiquement, avec le résultat encodé pour l'entraînement :
    2 = victoire domicile, 1 = nul, 0 = victoire extérieur.
    Les matchs sans score (pas encore joués) sont ignorés.
    """
    data = []
    for m in matchs:
        if m.get("score_home") is None or m.get("score_away") is None:
            continue

        if m["score_home"] > m["score_away"]:
            resultat = 2  # Victoire Domicile
        elif m["score_home"] == m["score_away"]:
            resultat = 1  # Nul
        else:
            resultat = 0  # Victoire Exterieur

        data.append({
            "id": m.get("id"),
            "home_team_id": m.get("home_team_id", 0),
            "away_team_id": m.get("away_team_id", 0),
            "resultat_reel": resultat,
            "date": m.get("utc_date", str(m.get("id"))),
        })

    return pd.DataFrame(data).sort_values(by="date").reset_index(drop=True)


def split_temporal(df: pd.DataFrame, train_ratio: float = 0.70) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Découpe un DataFrame déjà trié chronologiquement en deux blocs
    contigus : le début/mi-saison (entraînement) et la fin de saison
    (test). Pas de mélange aléatoire — c'est un split temporel, pas un
    split statistique classique, pour ne jamais entraîner sur le futur.
    """
    separation_index = int(len(df) * train_ratio)
    return df.iloc[:separation_index], df.iloc[separation_index:]


def train_model(df_entrainement: pd.DataFrame) -> RandomForestClassifier:
    """Entraîne le RandomForest sur le bloc début/mi-saison."""
    X_train = df_entrainement[["home_team_id", "away_team_id"]]
    y_train = df_entrainement["resultat_reel"]

    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    return model


def simulation_fin_de_saison():
    print("Extraction de l'historique complet depuis Supabase...")

    matchs = fetch_finished_matches()

    if not matchs or len(matchs) < 10:
        print(f"Nombre de donnees insuffisant ({len(matchs)} matchs trouves). Il faut au moins 10 matchs pour cette simulation.")
        return

    # Preparation, nettoyage et tri chronologique des donnees
    df = build_dataframe(matchs)
    total_matchs = len(df)

    # Separation proportionnelle (70% entrainement / 30% test)
    df_entrainement, df_test = split_temporal(df)

    print("\n[CONFIGURATION SIMULATION]")
    print(f"-> Total des matchs valides : {total_matchs}")
    print(f"-> Entrainement (Debut + Mi-saison) : {len(df_entrainement)} matchs")
    print(f"-> Test et Prediction (Fin de saison) : {len(df_test)} matchs")
    print("-" * 60)

    # 2. Entrainement de l'IA sur le debut/mi-saison
    model = train_model(df_entrainement)
    print("L'IA a fini d'apprendre sur le debut et la mi-saison.")

    # 3. Prediction sur la fin de saison
    X_test = df_test[["home_team_id", "away_team_id"]]
    y_reel = df_test["resultat_reel"]

    predictions = model.predict(X_test)
    probabilites = model.predict_proba(X_test)

    # 4. Affichage des resultats des predictions de fin de saison
    print("\nPredictions de l'IA sur les matchs de fin de saison :")

    for idx, (index_reel, row) in enumerate(df_test.iterrows()):
        pred_id = row["id"]
        res_reel_texte = MAPPING_RESULTAT[row["resultat_reel"]]
        res_pred_texte = MAPPING_RESULTAT[predictions[idx]]

        # Probabilites
        probs = probabilites[idx]
        prob_away = probs[0] * 100 if len(probs) > 0 else 0.0
        prob_draw = probs[1] * 100 if len(probs) > 1 else 0.0
        prob_home = probs[2] * 100 if len(probs) > 2 else 0.0

        statut = "REUSSI" if predictions[idx] == row["resultat_reel"] else "ECHOUE"

        print(f"Match ID {pred_id} | Probas: Dom ({prob_home:.0f}%) Nul ({prob_draw:.0f}%) Ext ({prob_away:.0f}%)")
        print(f"      -> Prediction IA : {res_pred_texte} | Resultat Reel : {res_reel_texte} [{statut}]")

    # 5. Calcul de la performance finale
    score_final = accuracy_score(y_reel, predictions) * 100
    print("-" * 60)
    print(f"PERFORMANCE FINALE DE L'IA : {score_final:.2f}% de predictions correctes sur la fin de saison !")


if __name__ == "__main__":
    simulation_fin_de_saison()
