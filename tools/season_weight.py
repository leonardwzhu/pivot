# Walk-forward test of the "this season's games" slider: after 3, 5, 10, 15, 20, 30 and 40 games, blend each player's preseason
# projection with his average so far (weight g/(g+K), K = 10 x 4^((0.5 - slider) x 2)) and score it against what he averaged the
# rest of the season. Tune on 2024-25, test on 2025-26. Needs work/hist/ from tools/build_matchup.py and tools/season_weight.js.
import json,datetime as D
from collections import defaultdict
SC=dict(pts=1,reb=1,ast=2,stl=4,blk=4,tpm=1,tov=-2,fgm=2,fga=-1,ftm=1,fta=-1);K=dict(pts='0',reb='6',ast='3',stl='2',blk='1',tpm='17',tov='11',fgm='13',fga='14',ftm='15',fta='16')
cK=lambda c:10*4**((.5-c)*2) if c>0 else 1e9
grid=[i/20 for i in range(21)];cps=[3,5,10,15,20,30,40]
def season(y):
  prior={r['e']:r['prior'] for r in json.load(open(f'work/hist/priors_{y}.json'))};G={}
  for t in json.load(open(f'work/hist/sched_{y}.json'))['settings']['proTeams']:
    for gs in (t.get('proGamesByScoringPeriod') or {}).values():
      for g in gs:G[str(g['id'])]=(D.datetime.fromtimestamp(g['date']/1000,D.UTC)-D.timedelta(hours=5)).date().isoformat()
  logs=defaultdict(list)
  for x in json.load(open(f'work/hist/logs_{y}.json'))['players']:
    p=x['player']
    if p['id'] not in prior:continue
    for st in p.get('stats',[]):
      v=st.get('stats');d=G.get(st.get('externalId'))
      if st.get('statSplitTypeId')==5 and st.get('statSourceId')==0 and v and d and v.get('40',0)>0:logs[p['id']].append((d,sum(SC[k]*v.get(i,0) for k,i in K.items())))
  err={c:[] for c in grid}
  for g in cps:
    rows=[(prior[e],sum(f for _,f in L[:g])/g,sum(f for _,f in L[g:])/len(L[g:])) for e,L in ((e,sorted(L)) for e,L in logs.items()) if len(L)>=g+10]
    for c in grid:err[c].append(sum(abs(pr+g/(g+cK(c))*(m-pr)-a) for pr,m,a in rows)/len(rows))
  return {c:sum(v)/len(v) for c,v in err.items()}
tr,te=season(2025),season(2026);pick=min(tr,key=tr.get)
print(f'tuned on 2024-25: {pick:.0%} (half trust at {cK(pick):.1f} games); on 2025-26 it misses {te[pick]:.3f} FP/G, best in hindsight {min(te,key=te.get):.0%} at {min(te.values()):.3f}')
for c in grid:print(f'  {c:4.0%}  2024-25 {tr[c]:.3f}  2025-26 {te[c]:.3f}')
