# Signals: what the box scores say before projections catch up. Writes work/p2_signals.js (const SIG) from ESPN's public data:
#   rest      every regular's record of sitting single games, back-to-back legs vs the rest (2024-25, 2025-26 and this season)
#   ramp      minutes and FP in the first games back from an absence of 5+ team games, against his minutes before it (history)
#   blowout   how much a regular's minutes and FP shrink as the final margin grows, the margin's spread around the teams' ratings
#             (history), and this season's team ratings
#   shooting  this season's makes and attempts (2s, 3s, free throws) against his last two seasons'
#   role      usage (shots, free-throw trips, turnovers) and starts: this season, last 5 games, last season
#   own       ESPN's roster share across all leagues and its change
#   tx        your league's adds, drops and trades, and how often each team changes its lineup (public league)
# History comes from work/hist/ (fetched by tools/build_matchup.py) and is kept in static/signals_hist.json, so the daily run
# needs only this season's files. Usage:
#   python3 -P tools/build_signals.py hist           rebuild static/signals_hist.json from work/hist/
#   python3 -P tools/build_signals.py txneed <today>  print the scoring periods whose transactions still need fetching
#   python3 -P tools/build_signals.py                 build work/p2_signals.js (merges work/tx_<q>.json into last/transactions.json)
import json,sys,os,glob,re,statistics as st,datetime as D
from collections import defaultdict
MAP={"NY":"NYK","UTAH":"UTA","WSH":"WAS","SA":"SAS","NO":"NOP","GS":"GSW","BKN":"BRK","PHX":"PHO","CHA":"CHO"}
K=dict(min='40',pts='0',reb='6',ast='3',stl='2',blk='1',tpm='17',tpa='18',tov='11',fgm='13',fga='14',ftm='15',fta='16',gs='41')
SC=dict(pts=1,reb=1,ast=2,stl=4,blk=4,tpm=1,tov=-2,fgm=2,fga=-1,ftm=1,fta=-1)  # ESPN standard points, for ratios only
fp=lambda g:sum(g[k]*v for k,v in SC.items())
day=lambda ms:(D.datetime.fromtimestamp(ms/1000,D.UTC)-D.timedelta(hours=5)).date()
TX='last/transactions.json'

def season(logs,sched):
  """team abbreviations, each team's games in date order, and each player's games {gid: stats}"""
  T=sched['settings']['proTeams'];ab={t['id']:MAP.get(t['abbrev'].upper(),t['abbrev'].upper()) for t in T};G={}
  for t in T:
    for gs in (t.get('proGamesByScoringPeriod') or {}).values():
      for g in gs:G[str(g['id'])]=(day(g['date']),g['homeProTeamId'],g['awayProTeamId'])
  team=defaultdict(list)
  for gid,(d,h,a) in G.items():team[h].append((d,gid));team[a].append((d,gid))
  for t in team:team[t].sort()
  P={}
  for x in logs['players']:
    p=x['player'];rows={}
    for s in p.get('stats',[]):
      if s.get('statSplitTypeId')!=5 or s.get('statSourceId')!=0 or not s.get('stats'):continue
      v=s['stats'];g=G.get(s.get('externalId') or str(s['id'])[2:])
      if not g or v.get('40',0)<=0:continue
      r={k:v.get(i,0) for k,i in K.items()};r.update(d=g[0],t=s.get('proTeamId'),h=s.get('proTeamId')==g[1]);rows[s.get('externalId') or str(s['id'])[2:]]=r
    if rows:P[str(p['id'])]=rows
  return ab,G,team,P

def scores(G,P,cover=150):
  """each game's points by team, summed over the logged players. The logs hold ESPN's top 650 players, so the minutes nobody
  logged (deep reserves) are filled at 0.42 points a minute, a typical end-of-bench rate, and a game counts only when both teams
  have at least `cover` of their 240 minutes logged"""
  S=defaultdict(lambda:defaultdict(lambda:[0.0,0.0]))
  for rows in P.values():
    for gid,r in rows.items():v=S[gid][r['t']];v[0]+=r['pts'];v[1]+=r['min']
  out={}
  for gid,v in S.items():
    h,a=G[gid][1],G[gid][2]
    if h in v and a in v and min(v[h][1],v[a][1])>=cover:out[gid]=(G[gid],v[h][0]+max(0,240-v[h][1])*.42,v[a][0]+max(0,240-v[a][1])*.42)
  return out

def rest(team,P):
  """single games missed between two games played, split by whether the team also played the day before or after"""
  out={}
  for e,rows in P.items():
    played=set(rows);c=[0,0,0,0];mins=[r['min'] for r in rows.values()]
    if len(rows)<10 or st.mean(mins)<20:continue
    for t in {r['t'] for r in rows.values()}:
      L=team.get(t,[]);days={d for d,_ in L}
      for i in range(1,len(L)-1):
        if L[i-1][1] in played and L[i+1][1] in played and rows[L[i-1][1]]['t']==t and rows[L[i+1][1]]['t']==t:
          d=L[i][0];b=(d-D.timedelta(days=1)) in days or (d+D.timedelta(days=1)) in days;k=0 if b else 2
          c[k]+=1;c[k+1]+=L[i][1] not in played
    out[e]=c
  return out

def hist():
  R=defaultdict(lambda:[0,0,0,0]);ramp=defaultdict(list);rlen=defaultdict(list);blow=defaultdict(list);res=[];prior={};last={}
  for s in (2025,2026):
    ab,G,team,P=season(json.load(open(f'work/hist/logs_{s}.json')),json.load(open(f'work/hist/sched_{s}.json')))
    for e,c in rest(team,P).items():R[e]=[a+b for a,b in zip(R[e],c)]
    # ramp: absences of 5+ team games between two games for the same team; minutes before = his last (up to) 10 games
    for e,rows in P.items():
      seq=sorted(rows.items(),key=lambda x:x[1]['d'])
      for t in {r['t'] for r in rows.values()}:
        L=[gid for _,gid in team.get(t,[])];idx={g:i for i,g in enumerate(L)};mine=[(idx[g],r) for g,r in seq if r['t']==t and g in idx]
        for j in range(5,len(mine)-1):
          gap=mine[j+1][0]-mine[j][0]-1
          if gap<5:continue
          pre=[r for _,r in mine[max(0,j-9):j+1]];m0=st.mean(r['min'] for r in pre);f0=st.mean(fp(r) for r in pre)
          if m0<15:continue
          for k in range(1,9):
            if j+k>=len(mine):break
            r=mine[j+k][1];ramp[k].append((r['min']/m0,fp(r)/max(1,f0)));(k<=3) and rlen[(0 if gap<10 else 1 if gap<20 else 2,k)].append(r['min']/m0)
    # blowouts: a regular's minutes and FP against his season average, by the final margin
    SS=scores(G,P);net=defaultdict(list)
    for gid,((d,h,a),hp,apt) in SS.items():net[h].append(hp-apt);net[a].append(apt-hp)
    N={t:st.mean(v) for t,v in net.items()}
    for gid,((d,h,a),hp,apt) in SS.items():res.append((hp-apt)-(N[h]-N[a]))
    for e,rows in P.items():
      if len(rows)<20:continue
      m0=st.mean(r['min'] for r in rows.values());f0=st.mean(fp(r) for r in rows.values())
      if m0<28:continue
      for gid,r in rows.items():
        if gid in SS:(_,hp,apt)=SS[gid];blow[min(5,int(abs(hp-apt)//5))].append((r['min']/m0,fp(r)/f0))
    # last two seasons' shooting, usage and starts
    for e,rows in P.items():
      v=[sum(r[k] for r in rows.values()) for k in ('fga','fgm','tpa','tpm','fta','ftm','min','tov','gs')]+[len(rows)]
      prior[e]=[a+b for a,b in zip(prior.get(e,[0]*10),v)]
      if s==2026:last[e]=v
  hca_sd=round(st.pstdev(res),1)
  med=lambda L:round(st.median(L),3)
  H=dict(rest=dict(R),
    ramp=[[k,med([a for a,_ in ramp[k]]),med([b for _,b in ramp[k]]),len(ramp[k])] for k in range(1,9) if len(ramp[k])>=20],
    rlen=[[b,k,med(v),len(v)] for (b,k),v in sorted(rlen.items()) if len(v)>=15],
    blow=[[b*5,b*5+5 if b<5 else 99,round(st.mean(a for a,_ in v),3),round(st.mean(c for _,c in v),3),len(v)] for b,v in sorted(blow.items())],
    sd=hca_sd,prior=prior,last=last)
  json.dump(H,open('static/signals_hist.json','w'),separators=(',',':'))
  print(f"signals history: rest for {len(R)} players, ramp {[x[1] for x in H['ramp']]}, blowout {[x[2] for x in H['blow']]}, margin spread {hca_sd}")

def txneed(today):
  have=set(json.load(open(TX)).get('done',[])) if os.path.exists(TX) else set()
  print(' '.join(str(q) for q in range(1,today+1) if q not in have or q>=today-2))  # the last 3 days again: waivers clear late

def txmerge():
  X=json.load(open(TX)) if os.path.exists(TX) else {'done':[],'tx':{},'lu':{}}
  for f in glob.glob('work/tx_*.json'):
    q=int(re.search(r'tx_(\d+)',f).group(1))
    try:T=json.load(open(f)).get('transactions',[])
    except Exception:continue
    lu=defaultdict(int)
    for t in T:
      if t.get('status')!='EXECUTED':continue
      if t['type'] in ('ROSTER','FUTURE_ROSTER'):lu[str(t['teamId'])]+=sum(i['type']=='LINEUP' for i in t.get('items',[]));continue
      it=[[i['playerId'],i['type'][0],i.get('fromTeamId',0),i.get('toTeamId',0)] for i in t.get('items',[]) if i['type'] in ('ADD','DROP','TRADE')]
      if it:X['tx'][t['id']]=[t.get('processDate') or t.get('proposedDate'),t['teamId'],t['type'][0],it]  # F free agent, W waiver, T trade
    X['lu'][str(q)]=dict(lu)
    if q not in X['done']:X['done'].append(q)
  X['done'].sort();json.dump(X,open(TX,'w'),separators=(',',':'))
  return X

def build():
  H=json.load(open('static/signals_hist.json'))
  ab,G,team,P=season(json.load(open('work/season_logs.json')),json.load(open('work/sched.json')))
  rc=rest(team,P);SIG={'P':{},'ramp':H['ramp'],'rlen':H['rlen'],'blow':H['blow'],'sd':H['sd']}
  SS=scores(G,P);net=defaultdict(list)
  for gid,((d,h,a),hp,apt) in SS.items():
    net[ab[h]].append(hp-apt);net[ab[a]].append(apt-hp)
  SIG['net']={t:[len(v),round(sum(v),1)] for t,v in net.items()}
  own={}
  try:
    for x in json.load(open('work/players_all.json'))['players']:
      o=(x.get('player') or x).get('ownership') or {};own[str((x.get('player') or x)['id'])]=[round(o.get('percentOwned') or 0,1),round(o.get('percentChange') or 0,2)]
  except Exception:pass
  for e in set(P)|set(H['prior'])|set(own):
    rows=sorted(P.get(e,{}).values(),key=lambda r:r['d']);o={}
    if rows:
      tot=lambda R:[round(sum(r[k] for r in R),1) for k in ('fga','fgm','tpa','tpm','fta','ftm','min','tov','gs')]+[len(R)]
      o['n']=tot(rows);o['n5']=tot(rows[-5:])
      o['g']=[[(r['d']-D.date(2026,10,19)).days,round(r['min']),r['fga'],r['fta'],r['tov'],int(r['gs'])] for r in rows[-15:]]
    if e in H['prior']:o['p']=H['prior'][e]
    if e in H['last']:o['l']=H['last'][e]
    r=[a+b for a,b in zip(H['rest'].get(e,[0]*4),rc.get(e,[0]*4))]
    if any(r):o['r']=r
    if e in own:o['o']=own[e]
    if rows or e in own:SIG['P'][e]=o
  # league-wide shooting this season and over the history, for shrinking a small sample toward the middle
  tot=[sum(v['p'][i] for v in SIG['P'].values() if 'p' in v) for i in range(6)]
  SIG['lg']=[round((tot[1]-tot[3])/max(1,tot[0]-tot[2]),4),round(tot[3]/max(1,tot[2]),4),round(tot[5]/max(1,tot[4]),4)]
  X=txmerge();SIG['tx']=sorted(X['tx'].values(),key=lambda t:t[0]);SIG['lu']=X['lu']
  open('work/p2_signals.js','w',encoding='utf-8').write("// Signals (tools/build_signals.py): rest record, return ramp, blowouts, shooting luck, role, ESPN adds, league moves\nconst SIG="+json.dumps(SIG,separators=(',',':'))+";\n")
  print(f"signals: {len(SIG['P'])} players, {len(SIG['net'])} teams rated, {len(SIG['tx'])} league moves")
  if len(SIG['P'])<200:raise SystemExit('too few players; keeping the last good file')

if __name__=='__main__':
  a=sys.argv[1:]
  if a[:1]==['hist']:hist()
  elif a[:1]==['txneed']:txneed(int(a[1]))
  else:build()
