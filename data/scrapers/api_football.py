import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

def fetch_and_save_matches():
    api_key = os.getenv("API_FOOTBALL_KEY")
    # Ligue 1 (61), Saison 2024
    url = "https://v3.football.api-sports.io/fixtures?league=61&season=2024"
    
    headers = {
        'x-rapidapi-host': "v3.football.api-sports.io",
        'x-rapidapi-key': api_key
    }

    print("Recuperation des donnees en cours...")
    response = requests.get(url, headers=headers)
    data = response.json()

    if data.get('response'):
        # On cree le dossier s'il n'existe pas
        os.makedirs('data/raw', exist_ok=True)
        
        # On sauvegarde tout le JSON dans un fichier
        with open('data/raw/matchs_2024.json', 'w', encoding='utf-8') as f:
            json.dump(data['response'], f, indent=4, ensure_ascii=False)
        
        print(f"Succes ! {len(data['response'])} matchs sauvegardes dans data/raw/matchs_2024.json")
    else:
        print("Erreur ou aucune donnee recue :", data.get('errors'))

if __name__ == "__main__":
    fetch_and_save_matches()