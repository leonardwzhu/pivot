# Your ESPN league (public read): teams by draft slot, draft picks, current rosters and the matchup schedule.
# Slots are draft positions 1..N, which is how the app numbers teams.
import json,sys,datetime
my_team=int(sys.argv[1])
d=json.load(open('work/league.json'))
s=d['settings'];ds=s['draftSettings'];order=ds['pickOrder']
slot={tid:i+1 for i,tid in enumerate(order)}
teams={slot[t['id']]:dict(id=t['id'],name=(t.get('name') or f"{t.get('location','')} {t.get('nickname','')}").strip(),abbrev=t.get('abbrev')) for t in d['teams'] if t['id'] in slot}
dd=d.get('draftDetail',{})
picks=[[p['overallPickNumber'],slot.get(p['teamId']),p['playerId']] for p in dd.get('picks',[]) if p.get('playerId',-1)>0]
rosters={slot[t['id']]:[e['playerId'] for e in t.get('roster',{}).get('entries',[])] for t in d['teams'] if t['id'] in slot}
# each player's ESPN lineup slot, as set on ESPN today (0 PG ... 11 UTIL, 12 bench, 13 IR)
slots={slot[t['id']]:{str(e['playerId']):e.get('lineupSlotId') for e in t.get('roster',{}).get('entries',[])} for t in d['teams'] if t['id'] in slot}
# who sits in each team's IR slot (ESPN lineup slot 13)
ir={slot[t['id']]:[e['playerId'] for e in t.get('roster',{}).get('entries',[]) if e.get('lineupSlotId')==13] for t in d['teams'] if t['id'] in slot}
# opponent by matchup week: opp[week-1][slot] = opponent slot (regular season; playoff pairings are set later)
opp={}
for m in d.get('schedule',[]):
    if 'home' not in m or 'away' not in m:continue
    w=str(m['matchupPeriodId']-1);h,a=slot.get(m['home']['teamId']),slot.get(m['away']['teamId'])
    if h and a:opp.setdefault(w,{});opp[w][h]=a;opp[w][a]=h
# standings and results: rec[slot] = [wins, losses, ties, points for, points against]; results = finished weeks
rec={}
for t in d['teams']:
    o=(t.get('record') or {}).get('overall') or {}
    if t['id'] in slot:rec[slot[t['id']]]=[o.get('wins',0),o.get('losses',0),o.get('ties',0),round(o.get('pointsFor',0),1),round(o.get('pointsAgainst',0),1)]
results=[];live=None;curMP=(d.get('status') or {}).get('currentMatchupPeriod')
for m in d.get('schedule',[]):
    if 'home' not in m or 'away' not in m:continue
    h,a=slot.get(m['home']['teamId']),slot.get(m['away']['teamId'])
    if not(h and a):continue
    row=[m['matchupPeriodId'],h,round(m['home'].get('totalPoints',0),1),a,round(m['away'].get('totalPoints',0),1),m.get('winner')]
    if m.get('winner') in('HOME','AWAY','TIE'):results.append(row)
    elif m['matchupPeriodId']==curMP and (row[2] or row[4]):live=live or [];live.append(row)
# playoffs: how many teams make it, and how many rounds of how many weeks (ESPN default: top 4, two rounds of two weeks)
ss=s['scheduleSettings'];reg_n=ss.get('matchupPeriodCount',19);pk=[k for k in ss.get('matchupPeriods',{}) if int(k)>reg_n]
po=dict(teams=ss.get('playoffTeamCount',4),rounds=len(pk) or 2,len=ss.get('playoffMatchupPeriodLength',2) or 1,reg=reg_n)
# this matchup's points by day for each team (ESPN's scoreboard), so the win chance counts what's already scored
dayPts={}
for m in d.get('schedule',[]):
    if m.get('matchupPeriodId')!=curMP:continue
    for k in('home','away'):
        x=m.get(k) or {};t=slot.get(x.get('teamId'))
        if t and x.get('pointsByScoringPeriod'):dayPts[t]={q:round(v,1) for q,v in x['pointsByScoringPeriod'].items()}
# the last three weeks of finished days (tools/build_days.py): lineups and points of everyone who scored, for the recap and the chart
days,dayP={},{}
try:
    D=json.load(open('work/days.json'));top=max(map(int,D['d']))
    for q,v in D['d'].items():
        if int(q)>top-21:days[q]={t:[r for r in rows if r[2]] for t,rows in v.items()}
    dayP={str(r[0]):D['p'].get(str(r[0])) for v in days.values() for rows in v.values() for r in rows}
except Exception:pass
sc={str(i['statId']):i['points'] for i in s['scoringSettings']['scoringItems']}
default={'0':1,'6':1,'3':2,'17':1,'1':4,'2':4,'13':2,'14':-1,'15':1,'16':-1,'11':-2}
L=dict(id=d['id'],name=s.get('name'),size=s['size'],mySlot=slot.get(my_team),fetched=datetime.date.today().isoformat(),
  drafted=bool(dd.get('drafted')),inProgress=bool(dd.get('inProgress')),draftDate=ds.get('date'),secPerPick=ds.get('timePerSelection'),
  type=s['scoringSettings'].get('scoringType'),defaultScoring=sc==default,teams=teams,picks=picks,rosters=rosters if any(rosters.values()) else None,opp=opp,
  tradeDeadline=s.get('tradeSettings',{}).get('deadlineDate'),rec=rec,results=results,live=live,curMatchup=curMP,
  po=po,ir={k:v for k,v in ir.items() if v},slots=slots,acq=s.get('acquisitionSettings',{}).get('acquisitionType'),days=days,dayP=dayP,dayPts=dayPts,irSlots=s['rosterSettings']['lineupSlotCounts'].get('13',0),benchSlots=s['rosterSettings']['lineupSlotCounts'].get('12',0))
open('work/p2_league.js','w',encoding='utf-8').write("// Your ESPN league, read from ESPN's public league API (synced daily)\nconst LEAGUE="+json.dumps(L,ensure_ascii=False,separators=(',',':'))+";\n")
print('league',L['name'],'size',L['size'],'my slot',L['mySlot'],'drafted',L['drafted'],'picks',len(picks),'default scoring',L['defaultScoring'],'weeks with opponents',len(opp),'playoffs',po)
