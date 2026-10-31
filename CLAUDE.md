# Pivot

Single-page fantasy basketball app (ESPN H2H Points). See README.md for layout and sources.

- The page is plain concatenation: `src/p1_head.html`, then the data files (`p2_data.js`, `p2_espn.js`, `p2_fp.js`, `p2_sched.js`, `p2_league.js`, `p2_games.js`, `p2_mates.js`, `p2_preds.js`, `p2_build.js`), then the `static/` files (`p2_draft.js`, `p2_fame.js`, `p2_ctx.js`, `p2_matchup.js`), then `src/p3_model.js` and `src/p3_rest.js`. The `assemble` function in `refresh.sh` is the source of truth for the order.
- Build and check with `bash refresh.sh`. To rebuild without fetching, run the same `cat` as `assemble` against `last/`, then `node tools/smoke_test.js "$(pwd)/build/draft-room.html"`.
- Code style is dense and compact, with few comments, each explaining why. Match it.
- Respect the sites' crawl delays (Basketball Reference 3+ s, FantasyPros 5 s). Don't fetch Basketball Reference game logs, splits or on/off pages: robots.txt disallows them.
- Never put ESPN cookies, tokens or other credentials in the repository. The league is read through ESPN's public endpoint.
- User-visible text: plain language, define stats on first use, no em dashes for asides.
- Workflow: do each change on its own branch; once it's tested and published, merge it into `main` and push without asking. The scheduled refreshes build from `main`, so an unmerged change gets overwritten by the next run.
