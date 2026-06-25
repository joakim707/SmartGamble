# Documentation Technique : Module d'Analyse Prédictive (SmartGamble IA)

Ce document détaille le fonctionnement, la méthodologie et l'architecture du module d'intelligence artificielle développé pour le projet SmartGamble. Ce module a pour but de prédire l'issue des matchs de football en s'appuyant sur l'historique des données stockées dans Supabase.

---

## 1. Architecture et Flux de Données

Le script data/predict.py suit un flux de traitement de données standard en Data Science (Pipeline ETL + Machine Learning) :

1. Connexion et Extraction (Supabase) : Connexion sécurisée via l'API client Supabase pour récupérer l'intégralité de la table match contenant les données historiques.
2. Préparation des Données (Pandas) : Nettoyage des valeurs nulles (matchs sans score) et encodage de la cible (Résultat : 2 = Victoire Domicile, 1 = Nul, 0 = Victoire Extérieur).
3. Validation Chronologique (Backtesting) : Tri des données par date pour simuler un scénario réel de fin de saison.
4. Entraînement (Scikit-Learn) : Apprentissage du modèle sur la première partie de la saison.
5. Évaluation (Metrics) : Test des prédictions sur les matchs masqués de fin de saison et calcul de l'Accuracy globale.

---

## 2. Méthodologie de Validation : Le Backtesting Chronologique

Pour valider scientifiquement l'efficacité de l'IA sans biais de données (sans Data Leakage), nous avons mis en place une séparation temporelle stricte :

* Données d'Entraînement (Début + Mi-Saison) : 70% des matchs les plus anciens. Le modèle utilise les variables home_team_id (Équipe Domicile) et away_team_id (Équipe Extérieur) pour apprendre les dynamiques de victoires/défaites.
* Données de Test (Fin de Saison) : 30% des matchs les plus récents. Ces données sont totalement masquées à l'IA pendant sa phase d'apprentissage et servent uniquement à évaluer sa performance en conditions réelles.

---

## 3. Algorithme Utilisé : Random Forest Classifier

Le modèle s'appuie sur l'algorithme du Forêt Aléatoire (Random Forest) via la bibliothèque sklearn.

### Pourquoi ce choix ?
* Robustesse : Il combine les prédictions de plusieurs arbres de décision (ici, n_estimators=100) pour réduire le risque de surapprentissage (Overfitting).
* Adaptabilité : Il gère très bien les variables catégorielles (comme les identifiants uniques des équipes de football) et calcule des probabilités précises pour chacune des 3 issues possibles (Gagnant, Nul, Perdant).

---

## 4. Analyse des Résultats Actuels

Lors de la dernière exécution sur la base de données active, les métriques clés sont les suivantes :
* Volume total analysé : 692 matchs valides.
* Volume d'entraînement : 484 matchs.
* Volume de test (Fin de saison) : 208 matchs.
* Performance Finale (Accuracy) : 38,94 % de prédictions correctes.

### Interprétation mathématique :
Dans un match de football, la probabilité de deviner l'issue exacte par pur hasard est de 1 sur 3, soit 33,33 %. Avec un score proche de 39 %, le modèle démontre mathématiquement qu'il extrait de l'information utile et qu'il surperforme le hasard pur, validant ainsi la viabilité technique de la Proof of Concept (PoC).

---

## 5. Pistes d'Amélioration (Feuille de Route)

Pour augmenter la précision de l'IA et atteindre les standards du marché (viser 60% à 65% de précision)
