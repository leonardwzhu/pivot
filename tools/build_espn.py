import json,re,unicodedata,datetime
P=json.load(open('work/players_all.json'))['players']
INJ=json.load(open('work/injuries.json'));NEWS=json.load(open('work/news.json'))['articles']
js=open('work/p2_data.js',encoding='utf-8').read()
DB=json.loads(re.search(r'const DB=(\{.*?\});\nconst PID',js,re.S).group(1))
def nm(s): s=unicodedata.normalize('NFD',s); s=''.join(c for c in s if unicodedata.category(c)!='Mn'); return re.sub(r'[^a-z ]','',s.lower().replace('.','').replace('-',' ')).replace(' jr','').replace(' iii','').replace(' ii','').replace(' iv','').strip()
TEAM={1:"ATL",2:"BOS",3:"NOP",4:"CHI",5:"CLE",6:"DAL",7:"DEN",8:"DET",9:"GSW",10:"HOU",11:"IND",12:"LAC",13:"LAL",14:"MIA",15:"MIL",16:"MIN",17:"BRK",18:"NYK",19:"ORL",20:"PHI",21:"PHO",22:"POR",23:"SAC",24:"SAS",25:"OKC",26:"UTA",27:"WAS",28:"TOR",29:"MEM",30:"CHO"}
POS={0:"PG",1:"SG",2:"SF",3:"PF",4:"C"}
idx={}
for pid,r in DB.items():
    k=nm(r['n']);sc=('2027' in r['s'])*2+('2026' in r['s'])
    if k not in idx or sc>idx[k][1]: idx[k]=(pid,sc)
def proj(pl,sid):
    for s in pl.get('stats',[]):
        if s.get('id')==sid and s.get('statSourceId')==1:
            a=s.get('averageStats') or {}
            g=lambda k:round(a.get(k,0),2)
            return [g('42'),g('40'),g('0'),g('6'),g('3'),g('2'),g('1'),g('17'),g('11'),g('13'),g('14'),g('15'),g('16')]
    return None
CON={}
for c in json.load(open('work/contracts.json'))['rows']:
    if c['name']!='Player':CON[c['key']]=c
ALIAS={'ronald holland':'ron holland'}
inj={}
for t in INJ['injuries']:
    for i in t['injuries']:
        inj[nm(i['athlete']['displayName'])]=dict(status=i['status'],ret=i.get('details',{}).get('returnDate'),fs=i.get('details',{}).get('fantasyStatus',{}).get('abbreviation'),
            short=i['shortComment'],date=i['date'][:10],type=i.get('details',{}).get('type'))
out=[];unmatched=[]
for x in P:
    pl=x['player'];r=pl.get('draftRanksByRankType',{});own=pl.get('ownership',{})
    k=nm(pl['fullName']);pid=idx.get(k,(None,))[0]
    if not pid: unmatched.append((r.get('STANDARD',{}).get('rank'),pl['fullName']))
    ol=(pl.get('seasonOutlook') or '').strip()
    team=TEAM.get(pl.get('proTeamId'),'FA');ck=CON.get(k) or CON.get(ALIAS.get(k,''))
    # every player on a standard NBA contract who is on a team right now (waived players still being paid are excluded)
    if not (ck and team!='FA'): continue
    out.append(dict(dp=pl.get('defaultPositionId'),e=pl['id'],j=pl.get('jersey') or '',pid=pid or (ck['pid'] if ck['pid'] in DB else None),sal=ck['sal'],n=pl['fullName'],t=TEAM.get(pl.get('proTeamId'),'FA'),pos=[POS[s] for s in pl.get('eligibleSlots',[]) if s in POS],
        st=pl.get('injuryStatus'),rk=r.get('STANDARD',{}).get('rank'),rr=r.get('ROTO',{}).get('rank'),adp=round(own.get('averageDraftPosition') or 0,1),
        auc=round(own.get('auctionValueAverage') or 0,1),own=round(own.get('percentOwned') or 0,1),ol=ol,pj=proj(pl,'102027'),pj26=proj(pl,'102026'),inj=inj.get(k)))
news=[dict(h=a['headline'],d=a.get('description',''),p=a.get('published'),t=a.get('type'),u=a.get('links',{}).get('web',{}).get('href'),
    tags=[c.get('description') for c in a.get('categories',[]) if c.get('type')=='athlete']) for a in NEWS if a.get('links',{}).get('web',{}).get('href')]
injall=[dict(n=i['athlete']['displayName'],**inj[nm(i['athlete']['displayName'])],team=t['displayName']) for t in INJ['injuries'] for i in t['injuries']]
f=open('work/p2_espn.js','w',encoding='utf-8')
f.write("// ESPN fantasy basketball data (default league settings): ranks, ADP, auction values, positions, injury status, outlooks and projections\n")
f.write("const ESPN="+json.dumps(out,ensure_ascii=False,separators=(',',':'))+";\n")
f.write("// ESPN NBA news and injury report\n")
f.write("const ESPN_NEWS="+json.dumps(news,ensure_ascii=False,separators=(',',':'))+";\n")
f.write("const ESPN_INJ="+json.dumps(injall,ensure_ascii=False,separators=(',',':'))+";\n")
f.write("const FETCHED='"+__import__('datetime').date.today().isoformat()+"';\n// standard (full) NBA contracts for 2026-27, from Basketball Reference's contracts page\nconst CONTRACT_SEASON='2026-27';\n")
f.close()
print('players',len(out),'with pid',sum(1 for o in out if o['pid']),'pj',sum(1 for o in out if o['pj']),'pj26',sum(1 for o in out if o['pj26']))
print('unmatched (rank,name):',sorted([u for u in unmatched if u[0]],key=lambda x:x[0])[:30])
print('top ranks',[(o['rk'],o['n'],o['adp']) for o in sorted(out,key=lambda o:o['rk'] or 999)[:15]])
