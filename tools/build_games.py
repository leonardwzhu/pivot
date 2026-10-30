# Recent games for every player in the pool: ESPN's last 10 scoring periods per player, matched to date and opponent.
# GAMES[espnId] = newest first, [date, opponent ("@" = away), min, pts, reb, ast, stl, blk, 3pm, tov, fgm, fga, ftm, fta]; [date, opponent] alone = did not play
import json,re,datetime as D
P=json.load(open('work/games.json'))['players']
pool={o['e']:o['t'] for o in json.loads(re.search(r'const ESPN=(\[.*?\]);\n',open('work/p2_espn.js',encoding='utf-8').read(),re.S).group(1))}
MAP={"NY":"NYK","UTAH":"UTA","WSH":"WAS","SA":"SAS","NO":"NOP","GS":"GSW","BKN":"BRK","PHX":"PHO","CHA":"CHO"}
G=json.load(open('static/games_2026.json'))
T=json.load(open('work/sched.json'))['settings']['proTeams'];ab={t['id']:MAP.get(t['abbrev'].upper(),t['abbrev'].upper()) for t in T}
for t in T:
    for gs in (t.get('proGamesByScoringPeriod') or {}).values():
        for g in gs:G[str(g['id'])]=[(D.datetime.fromtimestamp(g['date']/1000,D.UTC)-D.timedelta(hours=5)).date().isoformat(),ab.get(g['homeProTeamId']),ab.get(g['awayProTeamId'])]
K=['40','0','6','3','2','1','17','11','13','14','15','16']  # ESPN stat ids: min, pts, reb, ast, stl, blk, 3pm, tov, fgm, fga, ftm, fta
out={};miss=0
for x in P:
    pl=x['player'];e=pl['id']
    if e not in pool:continue
    rows=[]
    for s in pl.get('stats',[]):
        if s.get('statSplitTypeId')!=5 or s.get('statSourceId')!=0:continue
        g=G.get(str(s['id'])[2:])  # stat id = '05' + ESPN game id
        if not g:miss+=1;continue
        date,home,away=g;team=pool[e];opp=away if team==home else ('@'+home if team==away else f'{away}@{home}')
        st=s.get('stats') or {}
        rows.append([date,opp]+([(lambda v:int(v) if v==int(v) else v)(round(st.get(k,0),1)) for k in K] if st else []))
    if rows:out[e]=sorted(rows,key=lambda r:r[0],reverse=True)
OUT=("// ESPN game-by-game stats, last 10 team games per player (newest first): [date, opponent, min, pts, reb, ast, stl, blk, 3pm, tov, fgm, fga, ftm, fta]; [date, opponent] = did not play\nconst GAMES="+json.dumps(out,separators=(',',':'))+";\n")
print('games for',len(out),'players; unmatched game ids',miss)
if len(out)<200:raise SystemExit('too few players with recent games; keeping the last good file')
open('work/p2_games.js','w',encoding='utf-8').write(OUT)
