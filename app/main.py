import streamlit as st
import os
import requests
from dotenv import load_dotenv

load_dotenv()

# Configuration de la page
st.set_page_config(page_title="SmartGamble", layout="wide")

st.title("SmartGamble - Analyse Statistique")
st.subheader("Matchs de Ligue 1 (Saison 2024)")

# Fonction pour recuperer les donnees (identique a ton script)
def get_data():
    api_key = os.getenv("API_FOOTBALL_KEY")
    url = "https://v3.football.api-sports.io/fixtures?league=61&season=2024"
    headers = {
        'x-rapidapi-host': "v3.football.api-sports.io",
        'x-rapidapi-key': api_key
    }
    response = requests.get(url, headers=headers)
    return response.json().get('response', [])

# Affichage des donnees sur le site
matchs = get_data()

if matchs:
    # On affiche les 10 premiers sous forme de colonnes
    for m in matchs[:10]:
        col1, col2, col3 = st.columns([2, 1, 2])
        with col1:
            st.write(m['teams']['home']['name'])
        with col2:
            st.write("vs")
        with col3:
            st.write(m['teams']['away']['name'])
        st.divider()
else:
    st.error("Impossible de charger les matchs. Verifiez la configuration.")