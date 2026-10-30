#!/usr/bin/env bash
# Pivot daily refresh.
# Fetches today's data, rebuilds every data file, assembles build/draft-room.html and smoke-tests it.
# Any source that fails falls back to its last good copy in last/, so one broken site never blocks the update.
# Exit code: 0 = page built and passed the smoke test (see WARN lines for fallbacks), 1 = nothing publishable.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p work/bbr build
UA="Mozilla/5.0 (personal fantasy research; low volume)"
ESPN="https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2027"
# Your ESPN league (must be viewable to the public) and your team id in it
LEAGUE_ID=2005831999
MY_TEAM=1
fetch(){ curl -sS -m 90 -A "$UA" "${@:3}" -o "$2" -w "%{http_code}" "$1" 2>/dev/null || echo 000; }
use_last(){ cp "last/$1" "work/$1"; echo "WARN $2: using last good $1"; }
STATUS=()
# Parsers need beautifulsoup4 + lxml. -P keeps the script folder off the import path but still sees user-installed packages.
python3 -P -c "import bs4,lxml" 2>/dev/null || python3 -m pip install -q beautifulsoup4 lxml 2>/dev/null || python3 -m pip install -q --user --break-system-packages beautifulsoup4 lxml
python3 -P -c "import bs4,lxml" || echo "WARN bs4/lxml unavailable; stats and contracts will use last good data"

# 1) Basketball Reference, this season (robots.txt asks for 3+ seconds between requests)
bbr=1
for t in per_game per_minute per_poss advanced; do
  c=$(fetch "https://www.basketball-reference.com/leagues/NBA_2027_$t.html" "work/bbr/NBA_2027_$t.html"); [ "$c" = 200 ] || bbr=0; sleep 4
done
if [ $bbr = 1 ] && python3 -P tools/parse_bbr_current.py work/bbr 2027 work/season_2027.json && python3 -P tools/build_data.py; then STATUS+=("stats: fresh"); else use_last p2_data.js "Basketball Reference"; STATUS+=("stats: last good"); fi

# 2) Standard contracts (who is on a full NBA deal)
sleep 4
c=$(fetch "https://www.basketball-reference.com/contracts/players.html" work/contracts.html)
if [ "$c" = 200 ] && python3 -P tools/parse_contracts.py work/contracts.html work/contracts.json; then STATUS+=("contracts: fresh"); else use_last contracts.json "contracts"; STATUS+=("contracts: last good"); fi

# 3) ESPN fantasy players, injuries and news
c1=$(fetch "$ESPN/segments/0/leaguedefaults/3?view=kona_player_info" work/players_all.json -H 'X-Fantasy-Filter: {"players":{"limit":1200,"sortDraftRanks":{"sortPriority":100,"sortAsc":true,"value":"STANDARD"}}}')
c2=$(fetch "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries" work/injuries.json)
c3=$(fetch "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=60" work/news.json)
if [ "$c1$c2$c3" = 200200200 ] && python3 -P tools/build_espn.py; then STATUS+=("ESPN players/injuries/news: fresh"); else use_last p2_espn.js "ESPN"; STATUS+=("ESPN: last good"); fi

# 4a) Your league: teams, draft order, picks, rosters and matchups (public league, no login)
c=$(fetch "$ESPN/segments/0/leagues/$LEAGUE_ID?view=mSettings&view=mTeam&view=mDraftDetail&view=mRoster&view=mMatchup" work/league.json)
if [ "$c" = 200 ] && python3 -P tools/build_league.py "$MY_TEAM"; then cp work/league.json last/league.json; STATUS+=("league: fresh"); else rm -f work/league.json; use_last p2_league.js "league"; STATUS+=("league: last good"); fi

# 4b) ESPN schedule and current scoring period (matchup weeks follow your league's calendar)
c1=$(fetch "$ESPN?view=proTeamSchedules_wl" work/sched.json); c2=$(fetch "$ESPN" work/season.json)
if [ "$c1$c2" = 200200 ] && python3 -P tools/build_sched.py; then STATUS+=("schedule: fresh"); else use_last p2_sched.js "schedule"; STATUS+=("schedule: last good"); fi

# 4c) Recent games: every player's last 10 games in one request, matched to dates and opponents
c=$(fetch "$ESPN/segments/0/leaguedefaults/3?view=kona_player_info" work/games.json -H 'X-Fantasy-Filter: {"players":{"limit":1200,"sortDraftRanks":{"sortPriority":100,"sortAsc":true,"value":"STANDARD"},"filterStatsForTopScoringPeriodIds":{"value":10,"additionalValue":["002027"]}}}')
if [ "$c" = 200 ] && python3 -P tools/build_games.py; then STATUS+=("recent games: fresh"); else [ -f last/p2_games.js ] || echo "const GAMES={};" > last/p2_games.js; use_last p2_games.js "recent games"; STATUS+=("recent games: last good"); fi

# 5) FantasyPros expert consensus (robots.txt asks for 5 seconds between requests)
c=$(fetch "https://www.fantasypros.com/nba/rankings/overall.php" work/fp.html)
if [ "$c" = 200 ] && python3 -P tools/build_fp.py; then STATUS+=("FantasyPros: fresh"); else use_last p2_fp.js "FantasyPros"; STATUS+=("FantasyPros: last good"); fi

assemble(){ cat src/p1_head.html "$1/p2_data.js" "$1/p2_espn.js" "$1/p2_fp.js" "$1/p2_sched.js" "$1/p2_league.js" "$1/p2_games.js" static/p2_draft.js static/p2_fame.js static/p2_ctx.js static/p2_matchup.js src/p3_model.js src/p3_rest.js > build/draft-room.html; }

# 6) Assemble and smoke-test; if today's data breaks the page, fall back to the last good data set
assemble work
if node tools/smoke_test.js "$(pwd)/build/draft-room.html"; then
  cp work/p2_data.js work/p2_espn.js work/p2_fp.js work/p2_sched.js work/p2_league.js work/p2_games.js last/ 2>/dev/null; cp work/contracts.json last/ 2>/dev/null
  echo "BUILD OK: ${STATUS[*]}"; exit 0
fi
echo "WARN today's data failed the smoke test; rebuilding with the last good data"
assemble last
if node tools/smoke_test.js "$(pwd)/build/draft-room.html"; then echo "BUILD OK (last good data only)"; exit 0; fi
echo "BUILD FAILED"; exit 1
