# FantasyPros expert consensus rankings, matched to ESPN player ids. Keeps last good file if the page can't be parsed.
import re,json,unicodedata,sys
h=open('work/fp.html',encoding='utf-8').read();m=re.search(r'var ecrData = (\{.*?\});\s*\n',h,re.S)
if not m: sys.exit("FantasyPros ecrData not found")
d=json.loads(m.group(1))
def nm(s): s=unicodedata.normalize('NFD',s); s=''.join(c for c in s if unicodedata.category(c)!='Mn'); return re.sub(r'[^a-z ]','',s.lower().replace('.','').replace('-',' ')).replace(' jr','').replace(' iii','').replace(' ii','').replace(' iv','').strip()
E=json.loads(re.search(r'const ESPN=(\[.*?\]);\n',open('work/p2_espn.js',encoding='utf-8').read(),re.S).group(1))
fp={nm(p['player_name']):[p['rank_ecr'],round(float(p.get('rank_std') or 0),1),p.get('rank_min'),p.get('rank_max')] for p in d['players']}
FPR={o['e']:fp[nm(o['n'])] for o in E if nm(o['n']) in fp}
open('work/p2_fp.js','w').write("// FantasyPros expert consensus draft rankings: espnId -> [consensus rank, std dev, best, worst]\nconst FPRO="+json.dumps(FPR,separators=(',',':'))+";\nconst FPRO_META="+json.dumps({"experts":d['total_experts'],"updated":d['last_updated'],"scoring":d['scoring']})+";\n")
print('FantasyPros matched',len(FPR))
