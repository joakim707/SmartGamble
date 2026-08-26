from supabase import create_client
from dotenv import load_dotenv
import os
load_dotenv()
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SECRET_KEY'))

old = sb.table('team').select('id,name,league').lt('id', 100).execute()
new = sb.table('team').select('id,name,league').gte('id', 100).execute()

old_by_league = {}
for t in old.data:
    old_by_league.setdefault(t['league'], {})[t['name'].lower().strip()] = t

print('Doublons potentiels:')
pairs = []
for t in new.data:
    name_l = t['name'].lower().strip()
    league_map = old_by_league.get(t['league'], {})
    for old_name, old_t in league_map.items():
        if name_l in old_name or old_name in name_l:
            print('  new=' + str(t['id']) + ' "' + t['name'] + '" <-> old=' + str(old_t['id']) + ' "' + old_t['name'] + '" [' + t['league'] + ']')
            pairs.append((t['id'], old_t['id'], t['name'], old_t['name']))
            break

print()
print('Total doublons:', len(pairs))
