import sys,json,re,unicodedata
from bs4 import BeautifulSoup
t=BeautifulSoup(open(sys.argv[1],encoding='utf-8').read(),'lxml').find('table',id='player-contracts')
hdr=[th.text.strip() for th in t.find('thead').find_all('tr')[-1].find_all('th')]
def nm(s): s=unicodedata.normalize('NFD',s); s=''.join(c for c in s if unicodedata.category(c)!='Mn'); return re.sub(r'[^a-z ]','',s.lower().replace('.','').replace('-',' ')).replace(' jr','').replace(' iii','').replace(' ii','').replace(' iv','').strip()
out=[]
for r in t.find('tbody').find_all('tr'):
    c={x.get('data-stat'):x for x in r.find_all(['th','td'])}
    if 'player' not in c or not c['player'].text.strip():continue
    a=c['player'].find('a');pid=c['player'].get('data-append-csv') or (a['href'].split('/')[-1].replace('.html','') if a else None)
    sal=int(re.sub(r'[^0-9]','',c['y1'].text) or 0)
    out.append(dict(pid=pid,name=c['player'].text.strip(),key=nm(c['player'].text.strip()),team=c['team_id'].text.strip(),sal=sal))
json.dump({'season':hdr[3] if len(hdr)>3 else '','rows':out},open(sys.argv[2],'w'))
print('season col',hdr[3:5],'rows',len(out))
