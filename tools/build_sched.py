import json,datetime
d=json.load(open('work/sched.json'))['settings']['proTeams']
cur=json.load(open('work/season.json'))['currentScoringPeriod']['id']
MAP={"NY":"NYK","UTAH":"UTA","WSH":"WAS","SA":"SAS","NO":"NOP","GS":"GSW","BKN":"BRK","PHX":"PHO","CHA":"CHO"}
base=datetime.date(2026,10,19)  # scoring period 1 = Oct 20, 2026
SCHED={};days=set();OPP={}
ID2={t['id']:MAP.get(t['abbrev'],t['abbrev']) for t in d}
for t in d:
    if t['abbrev']=='FA':continue
    code=MAP.get(t['abbrev'],t['abbrev'])
    ps=sorted(int(p) for p,gs in t['proGamesByScoringPeriod'].items() if gs)
    SCHED[code]=ps;days.update(ps)
    o={}
    for p,gs in t['proGamesByScoringPeriod'].items():
        for g in gs:
            home=g['homeProTeamId']==t['id'];oid=g['awayProTeamId'] if home else g['homeProTeamId']
            o[p]=('' if home else '@')+ID2.get(oid,'?')
    OPP[code]=o
last=max(days);dateOf=lambda p:base+datetime.timedelta(days=p)
# Matchup calendar. If your league's matchup periods are final (after the draft), use them exactly. If the league drafts
# after opening night, ESPN starts Week 1 on the Monday after the draft. Otherwise use ESPN's default: an extended opening
# matchup through the second Sunday, then Monday-Sunday weeks, merging the lightest weeks until there are 19 + 4 playoff weeks.
import os
gd=lambda w:sum(1 for q in w if q in days)
LG=None
for f in ('work/league.json','last/league.json'):
    if os.path.exists(f):
        try:LG=json.load(open(f));break
        except Exception:pass
weeks=None
if LG:
    ss=LG['settings']['scheduleSettings'];mp=ss.get('matchupPeriods',{});reg_n=ss.get('matchupPeriodCount',19)
    per=[sorted(int(q) for q in mp[k]) for k in sorted(mp,key=int)]
    if LG.get('draftDetail',{}).get('drafted') and len(per)>=reg_n and all(len(x)>=5 for x in per[:reg_n]):
        # each matchup period lists its days; the app shows playoff rounds as single weeks
        weeks=[list(range(x[0],x[-1]+1)) for x in per[:reg_n]];p=weeks[-1][-1]+1
        while p<=last and len(weeks)<23:weeks.append(list(range(p,min(last,p+6)+1)));p+=7
        print('calendar: league matchup periods')
    else:
        dday=(datetime.datetime.fromtimestamp(LG['settings']['draftSettings']['date']/1000,datetime.timezone.utc)-datetime.timedelta(hours=5)).date()
        if dday>dateOf(1):
            start=dday+datetime.timedelta(days=(7-dday.weekday())%7 or 7) if dday.weekday()!=0 else dday
            p=(start-base).days;weeks=[]
            while p<=last:weeks.append(list(range(p,p+7)));p+=7
            print('calendar: late draft, week 1 starts',start)
if weeks is None:
    weeks=[];p=1
    first_end=next(q for q in range(8,15) if dateOf(q).weekday()==6)  # second Sunday
    weeks.append(list(range(1,first_end+1)));p=first_end+1
    while p<=last:
        weeks.append(list(range(p,p+7)));p+=7
weeks=[w for w in weeks if gd(w)>0]
# too many weeks for 19 regular + 4 playoff: merge the lightest regular-season week into the next one
while len(weeks)>23:
    i=min(range(1,len(weeks)-5),key=lambda i:gd(weeks[i]));weeks[i+1]=weeks[i]+weeks[i+1];del weeks[i]
print('matchup weeks',len(weeks),[ (dateOf(w[0]).isoformat(),dateOf(w[-1]).isoformat(),gd(w)) for w in weeks][-6:])
reg=weeks[:19];po=weeks[19:23]
W=[dict(i=i+1,s=dateOf(w[0]).isoformat(),e=dateOf(w[-1]).isoformat(),p=[w[0],w[-1]],po=i>=19) for i,w in enumerate(weeks[:23])]
open('work/p2_sched.js','w').write("// ESPN pro team schedules (scoring period = day; 1 = Oct 20, 2026)\nconst SCHED="+json.dumps(SCHED,separators=(',',':'))
  +";\nconst SCHED_OPP="+json.dumps(OPP,separators=(',',':'))+";\nconst CUR_PERIOD="+str(cur)+";\nconst PERIOD0='2026-10-19';\n// matchup weeks (ESPN default H2H calendar: 19 regular-season weeks, then playoffs in weeks 20-23)\nconst WEEKS="+json.dumps(W,separators=(',',':'))+";\n")
left={t:sum(1 for q in ps if q>=cur) for t,ps in SCHED.items()}
pog={t:sum(1 for q in ps if q>=W[19]['p'][0] and q<=W[22]['p'][1]) for t,ps in SCHED.items()}
print('games left',sorted(left.items(),key=lambda x:x[1])[:3],sorted(left.items(),key=lambda x:-x[1])[:3])
print('playoff games',sorted(pog.items(),key=lambda x:x[1])[:4],sorted(pog.items(),key=lambda x:-x[1])[:4])
print('week1',W[0],'playoffs',W[19]['s'],'to',W[22]['e'])
