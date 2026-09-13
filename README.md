# Gridiron Edge

Live FBS schedules and sportsbook odds with automatic line-change detection.

## Data sources

- ESPN scoreboard feed for schedules, start times, scores, and game status.
- The Odds API for real US sportsbook spreads, totals, and moneylines.

## One-time live setup

1. Create an API key at The Odds API.
2. Deploy `worker.js` as a Cloudflare Worker using `wrangler.toml`.
3. Add the API key as the Worker secret named `ODDS_API_KEY` (never commit the key).
4. Put the deployed Worker URL in `config.js`.
5. Keep GitHub Pages enabled for the repository's `main` branch.

The browser refreshes every 60 seconds and compares each response with the prior response to mark changes. Persistent historical charts require a database and a paid historical-data plan.
