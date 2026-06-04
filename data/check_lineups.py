"""Diagnostic : vérifie les compositions en BDD pour les matchs La Liga du 23 mai 2026."""

import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))

# Matchs La Liga du 23 mai 2026
matches = sb.table('match').select('id, sofascore_id, home_team_id, away_team_id, status') \
    .eq('league', 'La Liga') \
    .gte('match_date', '2026-05-23T00:00:00') \
    .lte('match_date', '2026-05-23T23:59:59') \
    .execute()

print(f'{len(matches.data)} matchs La Liga le 23 mai\n')

for m in matches.data:
    mid = m['id']
    # Récupérer équipes
    home = sb.table('team').select('name').eq('id', m['home_team_id']).execute()
    away = sb.table('team').select('name').eq('id', m['away_team_id']).execute()
    home_name = home.data[0]['name'] if home.data else '?'
    away_name = away.data[0]['name'] if away.data else '?'
    print(f'Match {mid} (sofa:{m["sofascore_id"]}) : {home_name} vs {away_name}')

    # Compter les entrées lineup
    lineup = sb.table('lineup').select('player_id, is_starter, is_absent, team_id') \
        .eq('match_id', mid).execute()

    starters   = [r for r in lineup.data if r['is_starter'] and not r['is_absent']]
    absent     = [r for r in lineup.data if r['is_absent']]
    subs       = [r for r in lineup.data if not r['is_starter'] and not r['is_absent']]

    print(f'  lineup total={len(lineup.data)}  titulaires={len(starters)}  remplaçants={len(subs)}  absents={len(absent)}')

    if starters:
        # Vérifier sofascore_id sur les joueurs titulaires
        player_ids = [r['player_id'] for r in starters]
        players = sb.table('player').select('id, name, sofascore_id') \
            .in_('id', player_ids).execute()
        with_sofa = [p for p in players.data if p['sofascore_id'] is not None]
        without_sofa = [p for p in players.data if p['sofascore_id'] is None]
        print(f'  joueurs avec sofascore_id={len(with_sofa)}  sans={len(without_sofa)}')
        if without_sofa:
            for p in without_sofa:
                print(f'    - {p["name"]} (id={p["id"]}) SANS sofascore_id')
    else:
        print('  -> 0 titulaires : la compo SofaScore n\'est pas en BDD')

    print()
