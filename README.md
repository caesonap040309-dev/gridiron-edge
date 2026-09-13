# Gridiron Edge

Live FBS schedules and sportsbook odds with automatic line-change detection.

## Data sources

- ESPN scoreboard feed for schedules, start times, scores, and game status.
- ESPN's available market feed for real spreads, totals, and moneylines.

## One-time live setup

No API key or repository secret is required. GitHub Actions updates the data automatically. You can also open **Actions → Update live college football data → Run workflow** to refresh it immediately.

GitHub refreshes the source data every 15 minutes and the open website checks for a new file every 60 seconds. Market availability and sportsbook coverage depend on ESPN's feed. Persistent historical charts require a database and a historical-data plan.
