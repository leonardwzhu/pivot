# Teammate splits for this season, plus last season's when the pair is still together: how each player did with and without
# each regular teammate, and how much of his recent form came without him (so a bump already in his form isn't counted twice).
# MATES[B] = [[A, games with A, FP/G with, games without, FP/G without, min/G with, min/G without, share of B's recent games without A]]
# Also this season from our own box scores, for the in-house season line and daily ranks:
# SLOG[espnId] = [[scoring period, FP (ESPN default scoring), minutes], ...] oldest first; SLINE[espnId] = season per-game averages
import json,re,datetime as D
from collections import defaultdict
MAP={"NY":"NYK","UTAH":"UTA","WSH":"WAS","SA":"SAS","NO":"NOP","GS":"GSW","BKN":"BRK","PHX":"PHO","CHA":"CHO"}
SC=dict(pts=1,reb=1,ast=2,stl=4,blk=4,tpm=1,tov=-2,fgm=2,fga=-1,ftm=1,fta=-1)
K=dict(pts='0',reb='6',ast='3',stl='2',blk='1',tpm='17',tov='11',fgm='13',fga='14',ftm='15',fta='16')
pool={o['e']:o['t'] for o in json.loads(re.search(r'const ESPN=(\[.*?\]);\n',open('work/p2_espn.js',encoding='utf-8').read(),re.S).group(1))}
T=json.load(open('work/sched.json'))['settings']['proTeams'];ab={t['id']:MAP.get(t['abbrev'].upper(),t['abbrev'].upper()) for t in T};G={}
for t in T:
  for gs in (t.get('proGamesByScoringPeriod') or {}).values():
    for g in gs:G[str(g['id'])]=(D.datetime.fromtimestamp(g['date']/1000,D.UTC)-D.timedelta(hours=5)).date().isoformat()
games=defaultdict(dict);tdates=defaultdict(set);teams=defaultdict(set);lines=defaultdict(list)  # games[pid][date]=(fp,min); a player's teams this season
for x in json.load(open('work/season_logs.json'))['players']:
  p=x['player']
  for st in p.get('stats',[]):
    if st.get('statSplitTypeId')!=5 or st.get('statSourceId')!=0 or not st.get('stats'):continue
    d=G.get(st.get('externalId') or str(st['id'])[2:]);v=st['stats']
    if not d or v.get('40',0)<=0:continue
    t=ab.get(st['proTeamId']);games[p['id']][d]=(sum(SC[k]*v.get(i,0) for k,i in K.items()),v['40'],t);tdates[t].add(d);teams[p['id']].add(t)
    lines[p['id']].append({k:v.get(i,0) for k,i in K.items()}|{'min':v['40']})
def span(a,t):  # the dates a was on team t: his whole season if he's there now and played nowhere else, else first to last game there
  ds=[d for d,g in games[a].items() if g[2]==t]
  if pool.get(a)==t and teams[a]<={t}:return tdates[t]
  return {d for d in tdates[t] if ds and min(ds)<=d<=max(ds)}
prior=json.load(open('static/mates_2026.json'))
roster=defaultdict(set)
for p,t in pool.items():roster[t].add(p)
for p,ts in teams.items():roster[pool.get(p) or next(iter(ts))].add(p)
out=defaultdict(list);dec=.5**.1
for t,R in roster.items():
  if t not in tdates:continue
  for a in R:
    ga=[g for g in games[a].values() if g[2]==t]
    if ga and sum(g[1] for g in ga)/len(ga)<18:continue  # only regulars' absences move anyone; a player with no games yet counts (injured since opening night)
    if not ga and a not in pool:continue
    S=span(a,t)
    for b in R:
      if b==a or pool.get(b)!=t:continue
      W=[];O=[];rec=[]
      for d in sorted(games[b]):
        g=games[b][d]
        if g[2]!=t or d not in S:continue
        o=d not in games[a];(O if o else W).append(g);rec.append(o)
      pr=prior.get(f'{a},{b},{t}',[0,0,0,0])
      if not rec and not pr[2]:continue
      nW=len(W)+pr[0];nO=len(O)+pr[2];sW=sum(g[0] for g in W)+pr[1];sO=sum(g[0] for g in O)+pr[3]
      rec=rec[-30:];w=[dec**(len(rec)-1-i) for i in range(len(rec))];sh=sum(x*y for x,y in zip(w,rec))/sum(w) if rec else 0
      mW=sum(g[1] for g in W)/len(W) if W else None;mO=sum(g[1] for g in O)/len(O) if O else None
      out[b].append([a,nW,round(sW/nW,1) if nW else None,nO,round(sO/nO,1) if nO else None,round(mW,1) if mW else None,round(mO,1) if mO else None,round(sh,2)])
n=sum(len(v) for v in out.values());print('teammate pairs',n,'for',len(out),'players')
if n<500:raise SystemExit('too few teammate pairs; keeping the last good file')
P0=D.date(2026,10,19)
SLOG={e:[[(D.date.fromisoformat(d)-P0).days,round(g[0],1),round(g[1])] for d,g in sorted(games[e].items())] for e in pool if games.get(e)}
SLINE={e:{k:round(sum(x[k] for x in L)/len(L),2) for k in list(K)+['min']}|{'gp':len(L)} for e,L in lines.items() if e in pool and L}
print('season logs for',len(SLOG),'players')
open('work/p2_mates.js','w').write("// Teammate splits (tools/build_mates.py): MATES[B] = [[A, games with A, FP/G with, games without, FP/G without, min/G with (this season), min/G without, share of B's recent games without A]]\nconst MATES="+json.dumps(out,separators=(',',':'))+";\nconst SLOG="+json.dumps(SLOG,separators=(',',':'))+";\nconst SLINE="+json.dumps(SLINE,separators=(',',':'))+";\n")
