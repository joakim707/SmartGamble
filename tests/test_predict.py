"""
Tests pytest pour data/predict.py : format des données, split temporel
70/30 et validité des probabilités renvoyées par le modèle entraîné.

Aucun test ne touche à la vraie base Supabase : la logique (transformation,
split, entraînement) est testée sur un DataFrame factice construit en
mémoire (fixtures), et l'accès réseau est testé séparément via un mock
du client Supabase.
"""

from datetime import datetime, timedelta
from random import Random
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

import predict


# ================================
# Fixtures
# ================================
@pytest.fixture
def raw_matches() -> list[dict]:
    """
    40 matchs factices, un par jour du 2025-01-01 au 2025-02-09, résultats
    mélangés (victoire domicile / nul / victoire extérieur en boucle).
    L'ordre des lignes est volontairement mélangé (Supabase ne garantit pas
    un ordre trié) pour que le test de tri chronologique soit significatif.
    """
    base_date = datetime(2025, 1, 1)
    outcomes = [(2, 0), (1, 1), (0, 3)]  # victoire dom / nul / victoire ext

    rows = []
    for i in range(40):
        score_home, score_away = outcomes[i % 3]
        rows.append({
            "id": i,
            "home_team_id": (i % 5) + 1,
            "away_team_id": ((i + 2) % 5) + 1,
            "score_home": score_home,
            "score_away": score_away,
            "utc_date": (base_date + timedelta(days=i)).isoformat(),
        })

    Random(42).shuffle(rows)
    return rows


@pytest.fixture
def sample_df(raw_matches) -> pd.DataFrame:
    return predict.build_dataframe(raw_matches)


# ================================
# build_dataframe : format des données
# ================================
class TestBuildDataframe:
    def test_filters_matches_without_score(self):
        matchs = [
            {"id": 1, "home_team_id": 1, "away_team_id": 2, "score_home": 2, "score_away": 1, "utc_date": "2025-01-01"},
            {"id": 2, "home_team_id": 1, "away_team_id": 2, "score_home": None, "score_away": None, "utc_date": "2025-01-02"},
        ]
        df = predict.build_dataframe(matchs)

        assert len(df) == 1
        assert df.iloc[0]["id"] == 1

    @pytest.mark.parametrize("score_home,score_away,expected_code", [
        (2, 0, 2),  # victoire domicile
        (1, 1, 1),  # nul
        (0, 3, 0),  # victoire extérieur
    ])
    def test_result_encoding(self, score_home, score_away, expected_code):
        matchs = [{
            "id": 1, "home_team_id": 1, "away_team_id": 2,
            "score_home": score_home, "score_away": score_away, "utc_date": "2025-01-01",
        }]
        df = predict.build_dataframe(matchs)

        assert df.iloc[0]["resultat_reel"] == expected_code


# ================================
# split_temporal : proportion et ordre chronologique
# ================================
class TestSplitTemporal:
    def test_split_ratio_70_30(self, sample_df):
        df_train, df_test = predict.split_temporal(sample_df)

        assert len(df_train) + len(df_test) == len(sample_df)
        # 40 lignes -> split exact, pas d'arrondi ambigu
        assert len(df_train) == 28
        assert len(df_test) == 12

    def test_split_is_chronological(self, sample_df):
        """
        Point méthodologique central du projet : aucune date du jeu
        d'entraînement ne doit être postérieure à une date du jeu de test,
        sous peine de fuite d'information (le modèle "verrait" le futur
        pendant l'entraînement, faussant l'évaluation).
        """
        df_train, df_test = predict.split_temporal(sample_df)

        assert df_train["date"].max() <= df_test["date"].min()
        # Et rien ne doit se chevaucher : chaque date de train < chaque date de test
        assert (df_train["date"].max() < df_test["date"]).all()


# ================================
# train_model : validité des probabilités prédites
# ================================
class TestModelProbabilities:
    def test_predict_proba_sums_to_one(self, sample_df):
        df_train, df_test = predict.split_temporal(sample_df)
        model = predict.train_model(df_train)

        probas = model.predict_proba(df_test[["home_team_id", "away_team_id"]])

        assert probas.shape[1] == 3  # une probabilité par issue (dom/nul/ext)
        for row in probas:
            assert row.sum() == pytest.approx(1.0)
            assert all(0.0 <= p <= 1.0 for p in row)


# ================================
# fetch_finished_matches : accès Supabase mocké
# ================================
class TestFetchFinishedMatches:
    def test_reads_data_from_mocked_supabase_client(self):
        """
        Vérifie que fetch_finished_matches() lit bien `.data` sur la réponse
        du client Supabase, sans jamais toucher au réseau : le client est
        entièrement remplacé par un mock.
        """
        fake_response = MagicMock()
        fake_response.data = [{
            "id": 1, "home_team_id": 1, "away_team_id": 2,
            "score_home": 1, "score_away": 0, "utc_date": "2025-01-01",
        }]
        mock_query = MagicMock()
        mock_query.execute.return_value = fake_response

        with patch.object(predict, "supabase") as mock_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value = mock_query
            result = predict.fetch_finished_matches()

        mock_supabase.table.assert_called_once_with("match")
        assert result == fake_response.data

    def test_returns_empty_list_on_supabase_error(self):
        """Une exception réseau/API ne doit pas planter l'appelant : liste vide."""
        with patch.object(predict, "supabase") as mock_supabase:
            mock_supabase.table.side_effect = Exception("connexion refusée")
            result = predict.fetch_finished_matches()

        assert result == []
