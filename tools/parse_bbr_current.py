# Parse this season's Basketball Reference tables (per game, per 36, per 100, advanced) into normalized season rows.
import sys,json,re,os,unicodedata
from bs4 import BeautifulSoup
src,year,out=sys.argv[1],sys.argv[2],sys.argv[3]
def num(x):
    x=(x or '').strip()
    if x=='':return None
    try:return float(x)
    except:return x
def nm(s): s=unicodedata.normalize('NFD',s); s=''.join(c for c in s if unicodedata.category(c)!='Mn'); return re.sub(r'[^a-z ]','',s.lower().replace('.','')).replace(' jr','').replace(' iii','').replace(' ii','').strip()
Y={}
for kind in ['per_game','per_minute','per_poss','advanced']:
    f=os.path.join(src,f'NBA_{year}_{kind}.html')
    t=BeautifulSoup(open(f,encoding='utf-8').read(),'lxml').find('table')
    for r in t.find('tbody').find_all('tr'):
        cells={c.get('data-stat'):c for c in r.find_all(['th','td'])};nc=cells.get('name_display') or cells.get('player')
        if nc is None or not nc.get('data-append-csv'):continue
        pid=nc['data-append-csv'];team=cells['team_name_abbr'].text.strip()
        rec=Y.setdefault(pid,{'name':nc.text.strip(),'rows':{}});row=rec['rows'].setdefault(team,{})
        row.update({f'{kind}:{k}':num(c.text) for k,c in cells.items() if k not in('ranker','name_display','player','awards')})
outd={}
for pid,rec in Y.items():
    rows=rec['rows'];keys=list(rows.keys());tot=next((k for k in keys if re.match(r'^\dTM$',k) or k=='TOT'),None);r=rows[tot or keys[0]]
    g=lambda k:r.get('per_game:'+k)
    if g('games') is None:continue
    outd[pid]=dict(name=rec['name'],key=nm(rec['name']),age=g('age'),pos=g('pos'),gp=g('games'),gs=g('games_started'),mp=g('mp_per_g'),fgm=g('fg_per_g'),fga=g('fga_per_g'),tpm=g('fg3_per_g'),tpa=g('fg3a_per_g'),
      ftm=g('ft_per_g'),fta=g('fta_per_g'),reb=g('trb_per_g'),ast=g('ast_per_g'),stl=g('stl_per_g'),blk=g('blk_per_g'),tov=g('tov_per_g'),pts=g('pts_per_g'),usg=r.get('advanced:usg_pct'),ts=r.get('advanced:ts_pct'),bpm=r.get('advanced:bpm'),
      poss_pts=r.get('per_poss:pts_per_poss'),teams=[[k,rows[k].get('per_game:games')] for k in keys if k!=tot])
json.dump(outd,open(out,'w'))
print(f'{year}: {len(outd)} players')
