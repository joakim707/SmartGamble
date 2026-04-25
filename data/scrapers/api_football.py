import os
import requests
from dotenv import load_dotenv

load_dotenv()

def test_api():
    api_key = os.getenv("API_FOOTBALL_KEY")
    # On demande tous les matchs de la saison 2024 (autorise)
    url = "https://v3.football.api-sports.io/fixtures?league=61&season=2024"
    
    headers = {
        'x-rapidapi-host': "v3.football.api-sports.io",
        'x-rapidapi-key': api_key
    }

    print("--- Diagnostic Technique ---")
    
    try:
        response = requests.get(url, headers=headers)
        data = response.json()

        if data.get('errors'):
            print("Erreurs detectees :", data['errors'])
        
        results = data.get('results', 0)
        if results > 0:
            # On affiche seulement les 10 premiers pour ne pas saturer le terminal
            matchs = data['response'][:10] 
            print(f"Succes : {len(matchs)} matchs recuperes sur un total de {results}")
            
            for m in matchs:
                home = m['teams']['home']['name']
                away = m['teams']['away']['name']
                date = m['fixture']['date'][:10] # On recupere juste la date (AAAA-MM-JJ)
                print(f"[{date}] Match : {home} vs {away}")
        else:
            print("Connexion etablie mais aucun match trouve.")
            print("Reponse brute :", data)

    except Exception as e:
        print("Une erreur est survenue :", str(e))

if __name__ == "__main__":
    test_api()