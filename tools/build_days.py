# Each finished day of your league: every team's lineup and each player's fantasy points, from ESPN's per-day roster view.
# The weekly recap (best games, points left on the bench) and the win-chance chart are built from it.
# `build_days.py need TODAY_SP` prints the scoring periods to fetch: days since the draft not yet saved, plus the last two
# (ESPN corrects stats overnight), at most 10 a run. `build_days.py merge` folds work/day_<sp>.json into work/days.json.
# days.json: {"d": {sp: {slot: [[espnId, lineupSlot, pts], ...]}}, "p": {espnId: [name, [eligible ESPN slots]]}}
import json,sys,os,glob,datetime,zoneinfo
P0=datetime.date(2026,10,19)
d=json.load(open('work/league.json'))
slot={tid:i+1 for i,tid in enumerate(d['settings']['draftSettings']['pickOrder'])}
def seed():
    # no days.json (a pipeline that only keeps the page's data files): start from the three weeks already in p2_league.js
    try:
        s=open('last/p2_league.js',encoding='utf-8').read();L=json.loads(s[s.index('{'):s.rindex('}')+1])
        return {"d":L.get('days') or {},"p":{k:v for k,v in (L.get('dayP') or {}).items() if v}}
    except Exception:return {"d":{},"p":{}}
cache=json.load(open('last/days.json')) if os.path.exists('last/days.json') else seed()
if sys.argv[1]=='need':
    today=int(sys.argv[2]);dd=d.get('draftDetail',{});dt=d['settings']['draftSettings'].get('date')
    if not dd.get('drafted') or not dt:sys.exit()
    first=max(1,(datetime.datetime.fromtimestamp(dt/1000,zoneinfo.ZoneInfo('America/New_York')).date()-P0).days)
    need=[q for q in range(first,today) if str(q) not in cache['d'] or q>=today-2]
    print(' '.join(map(str,sorted(need,reverse=True)[:10])))
    sys.exit()
for f in glob.glob('work/day_*.json'):
    q=f.split('_')[-1][:-5]
    try:x=json.load(open(f))
    except Exception:continue
    day={}
    for t in x.get('teams',[]):
        if t['id'] not in slot:continue
        rows=[]
        for e in (t.get('roster') or {}).get('entries',[]):
            pe=e.get('playerPoolEntry') or {};pl=pe.get('player') or {};pid=e['playerId']
            # the day's own stat line (split type 5 is a single scoring period); 0 when he didn't play
            pts=next((s.get('appliedTotal',0) for s in pl.get('stats',[]) if s.get('scoringPeriodId')==int(q) and s.get('statSplitTypeId')==5 and s.get('statSourceId')==0),0)
            rows.append([pid,e.get('lineupSlotId'),round(pts,1)])
            cache['p'][str(pid)]=[pl.get('fullName',''),[s for s in pl.get('eligibleSlots',[]) if s in(0,1,2,3,4,5,6,11)]]
        day[slot[t['id']]]=rows
    if day:cache['d'][q]=day
    os.remove(f)
json.dump(cache,open('work/days.json','w'),separators=(',',':'))
print('days saved',len(cache['d']),'latest',max(map(int,cache['d']),default=None))
