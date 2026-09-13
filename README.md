# Gridiron Edge

Live FBS schedules and sportsbook odds with automatic line-change detection.

## Data sources

- ESPN scoreboard feed for schedules, start times, scores, and game status.
- The Odds API for real US sportsbook spreads, totals, and moneylines.

## One-time live setup

1. Create an API key at The Odds API.
2. In GitHub, open **Settings → Secrets and variables → Actions**.
3. Create a repository secret named `ODDS_API_KEY` and paste the key there. Never add it to a code file.
4. Open **Actions → Update live college football data → Run workflow** once.
5. Keep GitHub Pages enabled for the repository's `main` branch.

GitHub refreshes the source data every 15 minutes and the open website checks for a new file every 60 seconds. The Odds API charges request credits based on markets and regions, so confirm that the selected plan supports this frequency. Persistent historical charts require a database and a historical-data plan.
