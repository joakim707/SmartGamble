# SmartGamble — Partie IA

## Objectif

Prédire le résultat d'un match de football (**victoire domicile / nul / victoire extérieure**) et associer à chaque prédiction un **indice de confiance** affiché dans l'interface.

L'IA s'entraîne sur les saisons passées et la 1ère moitié de la saison 2025-26, puis prédit tous les matchs de la 2ème moitié.

---

## Données utilisées

Les données viennent de 3 sources :

| Source | Ce qu'on récupère |
|---|---|
| football-data.org | Matchs, scores, dates, statuts |
| API-Sports | Classements des 5 ligues |
| Understat *(à venir)* | Expected Goals (xG) |

**État actuel de la base :**
- 997 matchs terminés avec scores ✓
- Forme des équipes calculée automatiquement depuis les scores ✓
- 96 entrées de classement ✓
- xG et absences : non encore récupérés ✗

---

## Ce qu'on a appris en chemin

### Problème 1 — Les scores avaient le mauvais nom
Le code cherchait `home_score` mais Supabase stocke `score_home`.  
Résultat : tous les scores retournaient zéro, le modèle voyait 997 matchs nuls (0-0) et prédisait "nul" à chaque fois avec un Log Loss de 0.0000 — une fausse bonne performance.

### Problème 2 — Une feature inutile
`home_advantage = 1` était une constante identique pour tous les matchs.  
Une valeur constante n'apporte aucune information à un modèle.  
→ Remplacée par `home_win_rate` : le taux de victoires à domicile réel de chaque équipe.

### Problème 3 — XGBoost plantait avec des données limitées
Avec un split 50/50, le set d'entraînement pouvait ne contenir que 2 résultats sur 3 (ex. : jamais de nul). XGBoost refusait de fonctionner.  
→ Passage à un split **70/30** + wrapper qui garantit toujours 3 classes en sortie.

### Problème 4 — La forme n'était pas en base
`home_form` et `away_form` étaient vides pour tous les matchs.  
→ On la **calcule directement** depuis les scores déjà en base : pour chaque match, on remonte les 5 derniers résultats de chaque équipe **avant** la date du match (pas de fuite de données).

---

## Architecture du pipeline

```
fetch_matches.py     →  matchs + scores (football-data.org)
fetch_standings.py   →  classements (API-Sports)
        ↓
predict.py
  ├── Calcul de la forme depuis les scores
  ├── Calcul du taux de victoires à domicile
  ├── Entraînement sur les matchs avant le 15/01/2026
  ├── Sélection du meilleur modèle (Log Loss)
  └── Prédictions sur tous les matchs après le 15/01/2026
```

---

## Les 3 modèles testés

### Momentum — *"La forme du moment"*
> Un Random Forest qui regarde les 5 derniers matchs de chaque équipe.

| Feature | Signification |
|---|---|
| `home_win_rate` | L'équipe à domicile gagne-t-elle souvent chez elle ? |
| `form_diff` | Quelle équipe est en meilleure forme ? |
| `goal_diff` | Quelle équipe marque le plus en ce moment ? |

### Effectif — *"L'impact des absences"*
> Un Random Forest qui tient compte des joueurs manquants.

| Feature | Signification |
|---|---|
| `home_win_rate` | Avantage domicile |
| `form_diff` | Forme récente |
| `abs_count_diff` | Combien de joueurs absents de chaque côté ? |
| `abs_impact_diff` | Sont-ils importants ? |

### Classement — *"La qualité sur la durée"*
> Un Gradient Boosting basé sur la position au classement.

| Feature | Signification |
|---|---|
| `home_win_rate` | Avantage domicile |
| `rank_diff` | Différence de rang entre les deux équipes |
| `points_diff` | Différence de points |
| `goal_diff_season` | Différentiel de buts sur la saison |

---

## Résultats

### Métriques sur le split 70/30 chronologique

| Modèle | Log Loss | Accuracy |
|---|---|---|
| **Momentum** *(retenu)* | **1.075** | **50.3 %** |
| Effectif | 1.190 | 48.0 % |
| Classement | 1.255 | 45.7 % |
| *Hasard pur (3 classes)* | *1.099* | *33.3 %* |

### Ce que ça veut dire

- **50 % de bonnes prédictions** contre 33 % au hasard → le modèle apprend vraiment quelque chose.
- Le **Log Loss de 1.075** est légèrement en dessous de la baseline aléatoire (1.099) → les probabilités sont bien calibrées.
- Les meilleurs modèles au monde sur ce problème plafonnent à ~55-60 % : le football reste très imprévisible.
- Les modèles Effectif et Classement sont moins bons car les données d'absences sont encore vides et les noms d'équipes entre les deux APIs ne correspondent pas encore parfaitement.

### Exemple de prédictions (matchs à venir)

| Match | DOM | NUL | EXT | Conf. | Prédiction |
|---|---|---|---|---|---|
| FC Nantes vs Toulouse FC | 18 % | 30 % | 51 % | 27 % | Victoire extérieure |
| Villarreal CF vs Atlético | 41 % | 28 % | 31 % | 11 % | Victoire domicile |
| Troyes vs Le Mans | 1 % | 97 % | 2 % | 96 % | ⚠️ Nul (équipes inconnues) |

> **Troyes vs Le Mans** : ces deux équipes n'ont aucun historique en base → `form_diff = 0`, `goal_diff = 0`. Le modèle ne les distingue pas et prédit un nul à 97 %. C'est la principale limite actuelle : il faut des données sur la saison 2025-26.

---

## Prochaines étapes

| Priorité | Action |
|---|---|
| 🔴 | Lancer `fetch_matches.py` saison 2025 pour récupérer les matchs 2025-26 |
| 🔴 | Corriger le matching des noms d'équipes entre APIs |
| 🟡 | Récupérer les Expected Goals (xG) via Understat |
| 🟡 | Récupérer les compositions et absences via football-data.org |
| 🟢 | Afficher la confiance dans le frontend (contour coloré autour de la cote) |

---

## Lancer le pipeline

```bash
python data/fetch_standings.py   # classements
python data/predict.py           # entraînement + prédictions
```
