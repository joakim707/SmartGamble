"""
Fusionne les équipes dupliquées entre football-data.org (id<100) et SofaScore (id>=100).
Ordre critique :
  1. Pour chaque match SofaScore qui ferait doublon après update team_id :
     copier sofascore_id vers l'ancien match + supprimer le doublon
  2. Repointer match.home/away_team_id
  3. Repointer lineup.team_id + player.team_id
  4. Mettre à jour le logo + supprimer la nouvelle équipe
"""

from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))

PAIRS = [
    (171, 71),  (196, 87),  (175, 60),  (166, 73),  (174, 66),
    (172, 69),  (176, 67),  (169, 72),  (170, 57),  (177, 75),
    (167, 76),  (165, 74),  (173, 62),  (197, 89),  (136, 52),
    (149, 55),  (150, 42),  (146, 50),  (142, 48),  (145, 43),
    (139, 37),  (153, 38),  (143, 41),  (179, 97),  (144, 54),
    (138, 44),  (140, 40),  (137, 39),  (141, 49),  (152, 56),
    (148, 46),  (151, 53),  (147, 51),  (156, 14),  (159, 24),
    (155, 12),  (157, 15),  (184, 96),  (191, 95),  (154, 29),
    (158, 8),   (135, 45),  (160, 11),
]

new_to_old = {n: o for n, o in PAIRS}


def resolve_duplicate_matches(new_id: int, old_id: int) -> None:
    """
    Pour un pair d'équipes, trouve les matchs SofaScore (avec sofascore_id) qui
    feraient doublon si on changeait new_id -> old_id, et les fusionne en avance.
    """
    for field in ('home_team_id', 'away_team_id'):
        sofa_ms = sb.table('match').select('id,sofascore_id,home_team_id,away_team_id,match_date,score_home,score_away,status') \
            .eq(field, new_id).filter('sofascore_id', 'not.is', 'null').execute()

        for sm in sofa_ms.data:
            other_field = 'away_team_id' if field == 'home_team_id' else 'home_team_id'
            other_id = sm[other_field]
            # Remplacer les new_id par old_id dans la recherche du doublon
            resolved_other = new_to_old.get(other_id, other_id)
            resolved_home = old_id if field == 'home_team_id' else resolved_other
            resolved_away = old_id if field == 'away_team_id' else resolved_other

            dups = sb.table('match').select('id') \
                .eq('home_team_id', resolved_home) \
                .eq('away_team_id', resolved_away) \
                .eq('match_date', sm['match_date']) \
                .is_('sofascore_id', 'null') \
                .execute()

            if not dups.data:
                continue

            old_mid = dups.data[0]['id']
            print('  merge match ' + str(sm['id']) + ' sofa=' + str(sm['sofascore_id']) + ' -> old match ' + str(old_mid))

            sofa_id    = sm['sofascore_id']
            score_home = sm['score_home']
            score_away = sm['score_away']
            status     = sm['status']

            # Repointer les lineups du doublon vers l'ancien match
            sb.table('lineup').update({'match_id': old_mid}).eq('match_id', sm['id']).execute()

            # Effacer sofascore_id du doublon avant de le copier (évite la violation UNIQUE)
            sb.table('match').update({'sofascore_id': None}).eq('id', sm['id']).execute()

            # Copier sofascore_id + scores vers l'ancien match
            sb.table('match').update({
                'sofascore_id': sofa_id,
                'score_home':   score_home,
                'score_away':   score_away,
                'status':       status,
            }).eq('id', old_mid).execute()

            # Supprimer le match doublon SofaScore (sofascore_id déjà null)
            sb.table('match').delete().eq('id', sm['id']).execute()


def merge_team(new_id: int, old_id: int) -> None:
    new_team = sb.table('team').select('name,logo_url').eq('id', new_id).execute()
    old_team = sb.table('team').select('name').eq('id', old_id).execute()
    if not new_team.data or not old_team.data:
        print('  [skip] equipe introuvable new=' + str(new_id) + ' old=' + str(old_id))
        return

    new_name = new_team.data[0]['name']
    old_name = old_team.data[0]['name']
    new_logo = new_team.data[0]['logo_url']
    print('Fusion: "' + new_name + '" (' + str(new_id) + ') -> "' + old_name + '" (' + str(old_id) + ')')

    # 1. Résoudre les matchs dupliqués avant toute mise à jour
    resolve_duplicate_matches(new_id, old_id)

    # 2. Repointer les matchs restants (non-dupliqués)
    sb.table('match').update({'home_team_id': old_id}).eq('home_team_id', new_id).execute()
    sb.table('match').update({'away_team_id': old_id}).eq('away_team_id', new_id).execute()

    # 3. Repointer les compositions et joueurs
    sb.table('lineup').update({'team_id': old_id}).eq('team_id', new_id).execute()
    sb.table('player').update({'team_id': old_id}).eq('team_id', new_id).execute()

    # 4. Mettre à jour le logo avec celui de SofaScore
    if new_logo and 'sofascore' in new_logo:
        sb.table('team').update({'logo_url': new_logo}).eq('id', old_id).execute()

    # 5. Supprimer la nouvelle équipe orpheline
    sb.table('team').delete().eq('id', new_id).execute()


def run() -> None:
    print('Fusion de ' + str(len(PAIRS)) + ' paires d\'equipes...')
    for new_id, old_id in PAIRS:
        merge_team(new_id, old_id)
    print('\nFusion terminee !')


if __name__ == '__main__':
    run()
