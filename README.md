# Pivot

Fantasy basketball hub for an ESPN head-to-head points league: draft room with a pick advisor, mock drafts and opponent scouting, then an in-season hub (Today, My Team, matchups, scouting other teams, waivers, a trade finder, rosters straight from ESPN). The Team Analyzer grades a team from any league. Projections come from a model fit on every NBA player-season since 2016-17, tuned walk-forward and blended with ESPN's projections. Next-game predictions come from a second model fit walk-forward on two seasons of game logs (recent form, opponent defense by position, home court, back-to-backs).

The app is one self-contained HTML page (no framework, no build step beyond concatenation), published as a claude.ai artifact and rebuilt daily with fresh data.

## Layout

| Path | What it is |
| --- | --- |
| `src/p1_head.html` | Markup and styles (tabs, sidebar, Method text) |
| `src/p3_model.js` | Projection model, walk-forward backtests, season simulation |
| `src/p3_rest.js` | Everything on screen: board, Pick Advisor, H2H lineup engine, My Team, season tabs, mock draft |
| `static/` | Data that doesn't change daily: 2016-17 to 2025-26 seasons, draft history, name value, context |
| `tools/` | Fetch, parse and build scripts, plus `smoke_test.js` |
| `last/` | Last good copy of every daily data file (used when a source fails) |
| `brand/` | The official logo files (mark, wordmark, app icon, favicon) and colors |
| `tests/` | Browser checks for the league sync, My Team and tab layout |
| `refresh.sh` | The daily refresh: fetch, build, assemble, smoke test |

## Build

```bash
bash refresh.sh
```

It fetches today's data, writes `work/` (data files) and `build/draft-room.html`, and smoke-tests the page in Chromium. It then runs `tools/log_preds.js`, which saves today's next-game predictions to `last/preds_log.json`, scores earlier ones against the games ESPN has recorded, and rebuilds the page with the scorecard. Exit 0 means the page is publishable. Any source that fails falls back to its copy in `last/`, and if today's data breaks the page the build is redone from `last/` entirely.

Sources:

| Source | What | Notes |
| --- | --- | --- |
| Basketball Reference | season tables (per game, per 36, per 100, advanced) and contracts | 4 s between requests (robots.txt asks 3+) |
| ESPN Fantasy API | player pool, projections, ranks, positions, NBA schedule | |
| ESPN Fantasy API | your league, public read | teams, picks, rosters, records, matchups |
| ESPN Fantasy API | every player's last 10 games | one request; `static/games_2026.json` dates last season's games |
| ESPN Fantasy API | every game of 2024-25 and 2025-26 | fetched once by `tools/build_matchup.py`, which fits the next-game model into `static/p2_matchup.js` and saves teammate splits in `static/mates_2026.json` |
| ESPN Fantasy API | each finished day of your league: every lineup and each player's points | one request per day, saved in `last/days.json` (the last two days are refetched for stat corrections); `tools/build_days.py` feeds the weekly recap and the win-chance chart |
| ESPN Fantasy API | every game this season | one request; `tools/build_mates.py` turns it into teammate splits, this season's per-game averages (they replace Basketball Reference's season line once they count more games) and the game log behind the daily ranks |
| ESPN site API | injuries and news | |
| FantasyPros | expert consensus ranks | |

Needs `python3` with `beautifulsoup4` and `lxml` (installed automatically if missing), `node`, and Playwright's Chromium for the smoke test.

## League settings

`LEAGUE_ID` and `MY_TEAM` at the top of `refresh.sh` pick the ESPN league (it must be viewable to the public) and your team in it. The matchup calendar follows the league: once the draft is done it uses ESPN's own matchup periods, numbered as ESPN numbers them (weeks run Monday to Sunday from opening night, the All-Star weeks are one matchup, and weeks before a late draft are simply past). Before the draft, a league that drafts after opening night is shown starting the Monday after the draft.

## Tests

```bash
bash refresh.sh                      # builds build/draft-room.html and runs the smoke test
node tests/tabs.js                   # nothing moves on tab clicks or picks; draft sidebar throughout Draft Day only
node tests/league_season.js          # league sync and My Team: before the draft, after a simulated draft, mid-season
node tests/modes.js                  # Draft Day / Season: which mode opens, which tabs show, last tab remembered
node tests/profile.js                # player profile: every section, recent games, next-game predictions, comparisons, phone
node tests/hub.js                    # Today, player search, Team Analyzer, prediction scorecard, injury fallout, teammate splits, phone
node tests/sync.js                   # cross-device sync of your edits, against a stand-in for the artifact store
node tests/draft.js                  # a full 104-pick draft on desktop and phone, as on draft day (a few minutes)
node tests/espn_rosters.js           # after the draft, rosters match ESPN exactly and nothing edits them
node tests/recap.js                  # on a made-up week: the win chance counts points already scored, the day-by-day chart, last week's recap, the luck meter
node tests/injuries.js               # the league sync updates rostered players' injuries between builds, without clearing the injury report's
node tests/pages.js                  # the GitHub Pages copy: Update links to the Pages workflow and offers Reload once a newer build is live (about 2 minutes)
```

## Publishing

The live app is a private claude.ai artifact. Three scheduled Claude sessions keep it current, each cloning this repository's `main` branch for the code and taking the data from the artifact's supporting files (`pipeline/last/`), which hold the last good copy of every data file and the prediction log:

| Run | When | What |
| --- | --- | --- |
| `bash refresh.sh` | 6:47am ET | every source, the teammate splits and the prediction scorecard |
| `bash refresh.sh injuries` | 5:11pm ET | only ESPN players, injuries and news, so late scratches reach the lineup advice before tip-off; prints the Today summary (`tools/digest.js`) that goes to your phone |
| `bash refresh.sh night` | 1:23am ET | after the last game: ESPN injuries, your league, the schedule and the night's box scores, and scores the night's predictions (it logs none, so tomorrow's are made in the morning) |

Each run republishes `build/draft-room.html` to the same link and saves the updated data files back to `pipeline/last/`. `last/sources.json` records when each source was last fetched fresh; the page header says when it was updated and shows a warning when the data is over a day old or a source has been stuck on its last good copy for more than 36 hours. Code changes reach the live app the morning after they're merged to `main`.

### GitHub Pages

`.github/workflows/pages.yml` publishes the same page as a website at `https://leonardwzhu.github.io/pivot/`. Turn it on once in the repository's Settings → Pages → Source: GitHub Actions. A push to `main` rebuilds from `last/` without fetching (`bash refresh.sh build`). Three scheduled runs at the same Eastern times as above run the matching refresh and commit the new `last/` back to `main`, and you can start one by hand from the Actions tab. `refresh.sh` writes `build/index.html` for this: the same page with its own charset and viewport tags, which claude.ai otherwise adds. The site reads your league live from ESPN like the artifact does. Its Update button's full update opens the workflow on GitHub (tap Run workflow; you're signed in there, so the site holds no key), then offers Reload once the new build is live. Syncing your edits across devices works only on claude.ai. On the website your edits stay in the browser you made them in.

Your own edits (draft picks entered by hand, roster moves, projection adjustments, settings) are kept in the browser and, through the artifact's private per-person store, synced across your devices: the newest copy wins when the page loads, and an open page offers a reload when another device changes something.
