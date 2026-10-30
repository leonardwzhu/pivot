# Pivot

Fantasy basketball hub for an ESPN head-to-head points league: draft room with a pick advisor, mock drafts and opponent scouting, then an in-season hub (My Team, matchups, waivers, trades, rosters). Projections come from a model fit on every NBA player-season since 2016-17, tuned walk-forward and blended with ESPN's projections.

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
| `tests/` | Browser checks for the league sync, My Team and tab layout |
| `refresh.sh` | The daily refresh: fetch, build, assemble, smoke test |

## Build

```bash
bash refresh.sh
```

It fetches today's data, writes `work/` (data files) and `build/draft-room.html`, and smoke-tests the page in Chromium. Exit 0 means the page is publishable. Any source that fails falls back to its copy in `last/`, and if today's data breaks the page the build is redone from `last/` entirely.

Sources:

| Source | What | Notes |
| --- | --- | --- |
| Basketball Reference | season tables (per game, per 36, per 100, advanced) and contracts | 4 s between requests (robots.txt asks 3+) |
| ESPN Fantasy API | player pool, projections, ranks, positions, NBA schedule | |
| ESPN Fantasy API | your league, public read | teams, picks, rosters, records, matchups |
| ESPN site API | injuries and news | |
| FantasyPros | expert consensus ranks | |

Needs `python3` with `beautifulsoup4` and `lxml` (installed automatically if missing), `node`, and Playwright's Chromium for the smoke test.

## League settings

`LEAGUE_ID` and `MY_TEAM` at the top of `refresh.sh` pick the ESPN league (it must be viewable to the public) and your team in it. The matchup calendar follows the league: when a league drafts after opening night, Week 1 starts the Monday after the draft. Once the draft is done, it uses ESPN's own matchup periods.

## Tests

```bash
bash refresh.sh                      # builds build/draft-room.html and runs the smoke test
node tests/tabs.js                   # draft sidebar shows only on draft tabs
node tests/league_season.js          # league sync and My Team: before the draft, after a simulated draft, mid-season
node tests/modes.js                  # Draft Day / Season: which mode opens, which tabs show, last tab remembered
```

## Publishing

The live app is a private claude.ai artifact. A scheduled Claude session runs `refresh.sh` every morning at 10:47 UTC and republishes `build/draft-room.html` to the same link. That session currently reads the pipeline from the artifact's own supporting files (`pipeline/`). Switching it to clone this repository instead is a one-line change to the scheduled task's prompt.
