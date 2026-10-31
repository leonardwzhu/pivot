# Per-game model: recent form (minutes x points per minute), teammates who are out, opponent defense by position, home court, back-to-backs. Fit walk-forward on the 2024-25 and
# 2025-26 ESPN game logs (every prediction uses only earlier dates), then writes static/p2_matchup.js: the weights, the
# backtest, each defense's carry-over into this season, and each player's record against each team (shown, not used: it hurt).
# Usage: python3 -P tools/build_matchup.py [--tune]   (fetches the raw logs into work/hist/ once, 2 s apart)
import json,sys,os,subprocess,time,itertools,datetime as D
from collections import defaultdict
os.makedirs('work/hist',exist_ok=True);E='https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/'
for s in (2025,2026):
  for f,u,h in ((f'sched_{s}',f'{E}{s}?view=proTeamSchedules_wl',[]),(f'logs_{s}',f'{E}{s}/segments/0/leaguedefaults/3?view=kona_player_info',['-H','X-Fantasy-Filter: {"players":{"limit":650,"sortDraftRanks":{"sortPriority":100,"sortAsc":true,"value":"STANDARD"},"filterStatsForTopScoringPeriodIds":{"value":200,"additionalValue":["00%d"]}}}'%s])):
    if not os.path.exists(f'work/hist/{f}.json'):subprocess.run(['curl','-sSf','-m','120','-o',f'work/hist/{f}.json',u]+h,check=True);time.sleep(2)
MAP={"NY":"NYK","UTAH":"UTA","WSH":"WAS","SA":"SAS","NO":"NOP","GS":"GSW","BKN":"BRK","PHX":"PHO","CHA":"CHO"}
SC=dict(pts=1,reb=1,ast=2,stl=4,blk=4,tpm=1,tov=-2,fgm=2,fga=-1,ftm=1,fta=-1)
K=dict(pts='0',reb='6',ast='3',stl='2',blk='1',tpm='17',tov='11',fgm='13',fga='14',ftm='15',fta='16')
rows=[]
for s in (2025,2026):
  T=json.load(open(f'work/hist/sched_{s}.json'))['settings']['proTeams'];ab={t['id']:MAP.get(t['abbrev'].upper(),t['abbrev'].upper()) for t in T};G={}
  for t in T:
    for gs in (t.get('proGamesByScoringPeriod') or {}).values():
      for g in gs:G[str(g['id'])]=((D.datetime.fromtimestamp(g['date']/1000,D.UTC)-D.timedelta(hours=5)).date().isoformat(),g['homeProTeamId'],g['awayProTeamId'])
  for x in json.load(open(f'work/hist/logs_{s}.json'))['players']:
    p=x['player'];grp={1:'G',2:'G',3:'F',4:'F',5:'C'}.get(p.get('defaultPositionId'),'F')
    for st in p.get('stats',[]):
      if st.get('statSplitTypeId')!=5 or st.get('statSourceId')!=0 or not st.get('stats'):continue
      g=G.get(st['externalId']);v=st['stats']
      if not g or v.get('40',0)<=0:continue
      date,h,a=g;home=st['proTeamId']==h
      rows.append((s,date,p['id'],ab[st['proTeamId']],ab[a if home else h],home,grp,sum(SC[k]*v.get(i,0) for k,i in K.items()),v['40']))
rows.sort(key=lambda r:(r[1],r[2]))
acc=defaultdict(list)
for r in rows:
  if r[0]==2025:acc[r[2]].append(r[7])
prior={p:sum(v)/len(v) for p,v in acc.items() if len(v)>=10}  # backtest stand-in for the preseason projection: last season's average
accm=defaultdict(list)
for r in rows:
  if r[0]==2025:accm[r[2]].append(r[8])
pmin={p:sum(v)/len(v) for p,v in accm.items() if len(v)>=10}  # and for projected minutes
by=defaultdict(list)
for r in rows:by[r[1]].append(r)
# Teammates: when A (20+ min) is out, B gains beta x A's form x B's share of the remaining teammates' form, moved toward what B
# actually did without A (Km games of weight on the rule). Only the part not already in B's recent form counts: x (out now - share
# of B's recent games without A).
# Minutes model (mm): form = points per minute (half-life hf games, Kf games of the preseason rate) x minutes (half-life hn,
# Kn games of preseason minutes). Minutes move with a new role within a game or two; efficiency barely moves.
def run(h=10,K=3,Kd=200,a=1,c=.25,hm=.01,b2=.04,b=0,Kh=15,beta=.4,Km=64,flat=False,mm=0,hf=20,hn=5,Kf=5,Kn=.5):
  mstate={};df=.5**(1/hf);dn=.5**(1/hn)
  pl={};de=defaultdict(lambda:[0.,0.,0]);hi=defaultdict(lambda:[0.,0.,0]);last={};out=[];season=None;dec=.5**(1/h)
  PR=defaultdict(lambda:[0,0.,0,0.,0.,0.]);team={};mins={};rec={}
  fo=lambda q:pl[q][0]/pl[q][1]
  for date in sorted(by):
    R=by[date]
    if R[0][0]!=season:  # new season: keep a fraction of last season's defensive record
      season=R[0][0];pl={};mstate.clear();mins={};rec={};de=defaultdict(lambda:[0.,0.,0],{k:[v[0]*c,v[1]*c,v[2]*c] for k,v in de.items()})
    here=defaultdict(set)
    for r in R:here[r[3]].add(r[2])
    ros={t:[q for q,tt in team.items() if tt==t and q in mins] for t in here}
    big=lambda q:mins[q][1]>=3 and mins[q][0]/mins[q][1]>=20 and q in pl
    pend=[]
    for r in R:
      s,_,p,tm,opp,home,grp,fp,mn=r;st=pl.get(p);pr=prior.get(p) if s==2026 else None
      if flat:base=st[2]/st[3] if st else pr
      elif st:base=(st[0]+K*pr)/(st[1]+K) if pr is not None else st[0]/st[1]
      else:base=pr
      if mm and base is not None and not flat:
        sm=mstate.get(p);pm=pmin.get(p) if s==2026 else None
        if sm and sm[1]>0:base=((sm[0]+Kf*pr)/(sm[1]+Kf*pm) if pr is not None and pm else sm[0]/sm[1])*((sm[2]+Kn*pm)/(sm[3]+Kn) if pm else sm[2]/sm[3])
      pred=None
      if base is not None and beta and not flat:
        act=[q for q in ros[tm] if q in pl and mins[q][0]/mins[q][1]>=10];adj=0
        for q in ros[tm]:
          if q==p or not big(q):continue
          S=sum(fo(x) for x in act if x!=q) or 1;pri=beta*fo(q)*base/S;v=PR[(q,p,tm)]
          dl=(v[2]*(v[3]/v[2]-v[1]/v[0])+Km*pri)/(v[2]+Km) if v[0]>=3 and v[2] else pri
          w=rec.get((p,q),[]);sh=sum(.5**((len(w)-1-i)/h)*x for i,x in enumerate(w))/sum(.5**((len(w)-1-i)/h) for i in range(len(w))) if w else 0
          adj+=dl*((q not in here[tm])-sh)
        base=base+max(-base,min(base,adj))
      if base is not None:
        d=de[(opp,grp)];f=1+((d[0]/d[1]-1)*d[2]/(d[2]+Kd) if d[1] else 0)
        q=hi[(p,opp)];g=1+((q[0]/q[1]-1)*q[2]/(q[2]+Kh) if q[1] else 0)
        btb=tm in last and (D.date.fromisoformat(date)-D.date.fromisoformat(last[tm])).days==1
        pred=base*max(.5,f)**a*max(.5,g)**b*(1+hm if home else 1-hm)*(1-b2 if btb else 1)
      out.append((r,pred,base));pend.append((r,base))
    for t,H in here.items():  # teammate splits and each player's recent with/without record, before today's games enter form
      for p in H:
        fp=next(r[7] for r in R if r[2]==p and r[3]==t)
        for q in ros[t]:
          if q==p or mins[q][1]<3:continue
          o=q not in H;v=PR[(q,p,t)];v[2 if o else 0]+=1;v[3 if o else 1]+=fp;w=rec.setdefault((p,q),[]);w.append(int(o));del w[:-30]
    for r,base in pend:
      s,_,p,tm,opp,home,grp,fp,mn=r;st=pl.setdefault(p,[0.,0.,0.,0]);team[p]=tm;m=mins.setdefault(p,[0.,0]);m[0]+=mn;m[1]+=1
      st[0]=st[0]*dec+fp;st[1]=st[1]*dec+1;st[2]+=fp;st[3]+=1
      q=mstate.setdefault(p,[0.,0.,0.,0.]);q[0]=q[0]*df+fp;q[1]=q[1]*df+mn;q[2]=q[2]*dn+mn;q[3]=q[3]*dn+1
      if base and base>5:
        for k,M in (((opp,grp),de),((p,opp),hi)):M[k][0]+=fp;M[k][1]+=base;M[k][2]+=1
    for r in R:last[r[3]]=date
  return out,de,hi,PR
def score(out,lo,hi_,nd=2):
  e=[r[7]-pr for r,pr,b in out if pr is not None and lo<=r[1]<hi_]
  return round(sum(map(abs,e))/len(e),nd),len(e)
EA,TR,TE=('2025-10-01','2025-11-20'),('2025-10-01','2026-02-01'),('2026-02-01','2026-05-01')  # tune on Oct-Jan, so the early season counts
P=dict(h=10,K=3,mm=1,hf=20,hn=5,Kf=5,Kn=.5,beta=.4,Km=64,Kd=200,a=1.5,c=.25,hm=.01,b2=.06)  # tuned on TR with --tune; TE is never used for tuning
if '--tune' in sys.argv:
  for k,vals in (('h',[5,10,20,40]),('K',[0,3,6,12]),('beta',[0,.2,.4,.6]),('Km',[16,32,64,128]),('a',[0,.5,1,1.5]),('Kd',[50,100,200,400]),('c',[0,.25,.5,1]),('hm',[0,.01,.02]),('b2',[0,.02,.04,.06])):
    res=[(score(run(**{**P,k:v})[0],*TR,4)[0],v) for v in vals];P[k]=min(res)[1];print(k,res)
  print('player vs team weight:',[(b,score(run(**P,b=b)[0],*TR)[0]) for b in (0,.5,1)])
out,de,hi,PR=run(**P)
bt=[]
for nm,pp in (('Season average so far',dict(flat=True,a=0,hm=0,b2=0)),('Recent form, weighted',dict(**{**P,'mm':0,'beta':0,'a':0,'hm':0,'b2':0})),('Minutes × points per minute',dict(**{**P,'beta':0,'a':0,'hm':0,'b2':0})),('+ teammates who are out',{**P,'a':0,'hm':0,'b2':0}),('+ opponent defense',{**P,'hm':0,'b2':0}),('+ home and back-to-backs',P),('+ record vs that team',{**P,'b':.5})):
  o=run(**pp)[0];bt.append([nm,score(o,*EA)[0],score(o,*TE)[0]])
n=score(out,*TE)[1];print(bt,n)
ratio=sorted(r[7]/pr for r,pr,b in out if pr and pr>=15 and TE[0]<=r[1]<TE[1])
q=[round(ratio[int(len(ratio)*x)],2) for x in (.1,.9)]
# game-to-game swing for the matchup and season simulations: actual/predicted at the middle of each 5% slice, and its spread
RQ=[round(ratio[int(len(ratio)*(.025+.05*k))],3) for k in range(20)];mu=sum(ratio)/len(ratio);CV=round((sum((x-mu)**2 for x in ratio)/len(ratio))**.5,3)
# ranges by prediction level: bench players swing far more, relative to their prediction, than stars. Fit on the tuning
# window: [low, high, 10th pct, 90th pct, 20 slices of actual/predicted for the simulators]; checked on the holdout
BQ=[]
for lo,up in zip([0,15,25,35,45],[15,25,35,45,999]):
  R=sorted(r[7]/pr for r,pr,b in out if pr and pr>1 and lo<=pr<up and TR[0]<=r[1]<TR[1])
  BQ.append([lo,up,round(R[int(len(R)*.1)],3),round(R[int(len(R)*.9)],3),[round(R[int(len(R)*(.025+.05*k))],3) for k in range(20)]])
bq=lambda pr:next(b for b in BQ if b[0]<=pr<b[1])
cov=[(lo,round(sum(1 for r,pr,b in out if pr and pr>1 and lo<=pr<up and TE[0]<=r[1]<TE[1] and pr*bq(pr)[2]<=r[7]<=pr*bq(pr)[3])/max(1,sum(1 for r,pr,b in out if pr and pr>1 and lo<=pr<up and TE[0]<=r[1]<TE[1])),2)) for lo,up,*_ in BQ]
print('holdout share inside the 80% range by level',cov)
DEF={}
for (t,g),v in de.items():DEF.setdefault(t,{})[g]=[round(v[0]*P['c']),round(v[1]*P['c']),round(v[2]*P['c'],1)]
VS=defaultdict(dict)
for (p,t),v in hi.items():
  if v[2]>=2 and v[1]:VS[p][t]=[v[2],round(100*v[0]/v[1])]
spread={t:{g:round(x[0]/x[1],3) for g,x in d.items() if x[1]} for t,d in DEF.items()}
print('quantiles',q,'RQ',RQ,'CV',CV,'defense range',min((min(d.values()) for d in spread.values() if d),default=1),max((max(d.values()) for d in spread.values() if d),default=1))
open('static/p2_matchup.js','w').write('// Per-game model fit on 2024-25 and 2025-26 ESPN game logs (tools/build_matchup.py). P = weights; BT = backtest MAE [early season, Feb-Apr 2026 holdout];\n'
  '// Q = 10th/90th percentile of actual/predicted (BQ: the same by prediction level, BQC its holdout coverage); RQ = actual/predicted at the middle of each 5% slice, CV its spread (both drive the simulators); DEF = each defense\'s carried-over record vs guards/forwards/centers [FP allowed, FP expected, games];\n'
  '// VS = player record vs each team over two seasons [games, FP as % of what was expected]\nconst MATCHUP='+json.dumps(dict(P=P,BT=bt,N=n,Q=q,RQ=RQ,CV=CV,BQ=BQ,BQC=cov,DEF=DEF,VS=VS),separators=(',',':'))+';\n')
print('wrote',os.path.getsize('static/p2_matchup.js'),'bytes')
# teammate splits from the last two seasons, for the daily build to start from: "A,B,team": [games with A, FP with, games without, FP without]
M={f'{a},{b},{t}':[v[0],round(v[1]),v[2],round(v[3])] for (a,b,t),v in PR.items() if v[0]>=3 and v[2]>=1}
json.dump(M,open('static/mates_2026.json','w'),separators=(',',':'));print('teammate splits',len(M),os.path.getsize('static/mates_2026.json'),'bytes')
