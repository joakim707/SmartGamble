 SmartGamble 

> Plateforme d'analyse statistique pour guider les paris sportifs sur les 5 grands championnats européens.

 Description

SmartGamble agrège des données statistiques sur les matchs de football à venir et calcule un **indice de confiance** basé sur de nombreux critères (forme des équipes, classement, historique des confrontations, joueurs absents, domicile/extérieur...). L'objectif est d'aider l'utilisateur à identifier les paris les plus pertinents selon son profil de risque.

 Stack technique

| Composant | Technologie | Justification |
|---|---|---|
| Frontend / UI | Streamlit | Framework Python natif orienté data, idéal pour des dashboards analytiques sans overhead JS. Rapide à itérer. |
| Backend / Logique | Python 3.11+ | Langage de référence pour la data science et le scraping. Cohérence full-stack. |
| Base de données | PostgreSQL | Données structurées et relationnelles (matchs, équipes, cotes, stats). Mises à jour planifiées 2x/jour (non temps-réel). Intégrité et jointures efficaces. |
| Scraping / Data | Python (requests, BeautifulSoup / Scrapy) | Récupération automatisée des cotes et statistiques depuis des sources publiques. |
| Scoring / ML | Scikit-learn (TBD) | Modèle d'estimation des résultats basé sur les données historiques et contextuelles. |
| Planification | APScheduler ou cron | Mises à jour automatiques des données (midi et minuit). |

 Structure du projet


smartgamble/
├── app/                   Interface Streamlit
│   ├── pages/             Pages de l'application
│   └── components/        Composants réutilisables
├── data/                  Scripts de collecte et scraping
│   ├── scrapers/          Scrapers par source
│   └── pipelines/         Nettoyage et transformation
├── model/                 Logique de scoring et ML
│   ├── features/          Feature engineering
│   └── scoring/           Calcul de l'indice de confiance
├── db/                    Base de données
│   ├── schema.sql         Schéma PostgreSQL
│   └── migrations/        Migrations
├── docs/                  Documentation des choix techniques
│   ├── tech_choices.md    Justification des choix technologiques
│   └── data_sources.md    Sources de données utilisées
├── tests/                 Tests unitaires
├── .env.example           Variables d'environnement (template)
├── .gitignore
├── requirements.txt
└── README.md


 Installation

bash
 Cloner le repo
git clone https://github.com/<org>/smartgamble.git
cd smartgamble

 Créer un environnement virtuel
python -m venv .venv
source .venv/bin/activate   Windows : .venv\Scripts\activate

 Installer les dépendances
pip install -r requirements.txt

 Configurer les variables d'environnement
cp .env.example .env
 Remplir les valeurs dans .env

 Lancer l'application
streamlit run app/main.py


 Variables d'environnement

Copier `.env.example` en `.env` et remplir les valeurs :

env
DATABASE_URL=postgresql://user:password@localhost:5432/smartgamble
API_FOOTBALL_KEY=your_api_key_here


 Workflow Git


main        → branche de production, toujours stable
develop     → branche d'intégration
feature/xxx → une branche par fonctionnalité
fix/xxx     → corrections de bugs


**Convention de commits :**

feat: ajout affichage matchs ligue 1
fix: correction calcul indice de confiance
docs: mise à jour justification stack technique
chore: configuration gitignore et requirements


Toute contribution passe par une **Pull Request** vers `develop`. Une review est requise avant le merge.

 Équipe

Projet réalisé dans le cadre du stage EPSI Paris — promotion CDA 2025/2026.

---

*SmartGamble — Paris éclairés, risques maîtrisés.*
