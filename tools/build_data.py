# Merge history + this season into the compact DB the page uses, plus team pace.
import json,re,unicodedata,sys
hist=json.load(open('static/seasons_hist.json'));cur=json.load(open('work/season_2027.json'))
S={**hist,'2027':cur}
def nm(s): s=unicodedata.normalize('NFD',s); s=''.join(c for c in s if unicodedata.category(c)!='Mn'); return re.sub(r'[^a-z ]','',s.lower().replace('.','')).replace(' jr','').replace(' iii','').replace(' ii','').strip()
r1=lambda x:None if x is None else round(x,1)
DB={}
for y in sorted(S):
    for pid,l in S[y].items():
        if not l['gp']:continue
        sp=[t for t in l['teams'] if t[1]];team=sp[-1][0] if sp else (l['teams'][-1][0] if l['teams'] else None)
        splits=",".join(f"{t}:{int(g)}" for t,g in sp) if len(sp)>1 else ""
        rec=[l['age'] and int(l['age']),team,int(l['gp']),r1(l['mp']),r1(l['pts']),r1(l['reb']),r1(l['ast']),r1(l['stl']),r1(l['blk']),r1(l['tpm']),r1(l['tov']),r1(l['fgm']),r1(l['fga']),r1(l['ftm']),r1(l['fta']),r1(l['usg']),splits]
        DB.setdefault(pid,{'n':l['name'],'s':{}})['s'][y]=[0 if v is None else v for v in rec]
# player ids for last season's rookies (used by the college-to-NBA translation in the model)
COLL=["Cooper Flagg","Kon Knueppel","Ace Bailey","Dylan Harper","Khaman Maluach"]
idx={}
for pid,r in DB.items():
    k=nm(r['n']);sc=('2027' in r['s'])*2+('2026' in r['s'])
    if k not in idx or sc>idx[k][1]:idx[k]=(pid,sc)
PID={n:idx[nm(n)][0] for n in COLL if nm(n) in idx}
pace=[]
for y in ('2026','2027'):
    acc={}
    for pid,l in S[y].items():
        if len(l['teams'])!=1 or not l.get('poss_pts') or not l['pts'] or not l['mp'] or l['mp']<10:continue
        p48=l['pts']*100/l['poss_pts']/l['mp']*48;t=l['teams'][0][0];w=l['mp']*l['gp'];a=acc.setdefault(t,[0,0]);a[0]+=p48*w;a[1]+=w
    pace.append(f"const PACE{y[2:]}="+json.dumps({t:round(a[0]/a[1],1) for t,a in sorted(acc.items())})+";")
with open('work/p2_data.js','w',encoding='utf-8') as f:
    f.write("// Basketball Reference season tables, 2016-17 through 2026-27 (so far)\n// DB[pid] = {n: name, s: {season_end_year: [age, team, gp, mpg, pts, reb, ast, stl, blk, 3pm, tov, fgm, fga, ftm, fta, usg%, team splits]}}\n")
    f.write("const DB="+json.dumps(DB,separators=(',',':'),ensure_ascii=False)+";\nconst PID="+json.dumps(PID,ensure_ascii=False)+";\nconst EXTRA=[];\n// Team pace (possessions per 48)\n"+"\n".join(pace)+"\n")
print('DB players',len(DB),'2026-27 players',len(cur))
