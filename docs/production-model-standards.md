# Production model standards

Gridiron Edge remains the live product. These controls run during production refreshes.

## One betting policy

`betting-policy.js` supplies game details, Top 10, prop details, and forward selection records. It requires fresh quotes at the exact line used to calculate the probability, adequate evidence, acceptable price, meaningful edge, and current game inputs. Value uses the offered price's actual break-even probability. DFS synthetic odds are not sportsbook EV; entry returns require the actual entry payout.

The initial unified thresholds preserve the stricter existing Top 10 rules. They are not relaxed to populate the board. The audit separates blocked data from forecasts that fail price, probability, or evidence thresholds. Any later threshold change must be compared chronologically using saved predictions and actual prices, with correlation and sample size reported.

## Verified records

The audit counts one latest valid pregame forecast per game and reports moneyline, spread, and total separately by model version. Missing prices are excluded from ROI. A probability calculated at a different line is excluded from probability-versus-market comparisons. Model and sportsbook errors use matched samples and no-vig paired prices. Win-rate intervals, probability calibration buckets, margin/total errors, exclusions, and priced sample counts are stored in `data/model-audit.json`.

`data/verified-historical-snapshots.json` contains forecasts recovered from repository versions committed before kickoff, with commit provenance. Recovery proves the forecast existed before the game; it does not make an old tracked prediction a qualified bet, nor recover missing prices.

Qualified game plays are frozen with their policy version in `data/model-snapshots.json`. Qualified prop eligibility, projection, sample count, and offered price are saved before kickoff. Older tracked picks remain separate and are never relabeled as qualified bets. Multiple versions of one tracked player/market are deduplicated in the audit. The public performance panel separates all forecasts from qualified sportsbook results.

## Calibration and coefficient promotion

Calibration uses earlier games to fit and later games to evaluate, independently for winners, spreads, and totals. It requires at least 60 aligned samples, 30 training games, and 20 later evaluation games. Simultaneous games do not straddle the training boundary. Small-sample factors remain neutral. NFL residual score corrections also require improvement on later games before a bounded correction is applied. Future forecasts retain probabilities before calibration to avoid repeatedly fitting already-adjusted values. Confidence increases require a later error improvement whose interval excludes zero.

Paired feature comparisons deduplicate games and require at least 100 completed forward pairs across six weeks, a lower error interval, and at least a 0.2-point average error improvement before supporting coefficient promotion. The historical chronological feature comparison is reported as development evidence, not a replay of production betting profit. Current caps remain fixed; no new scoring coefficient is automatically fitted from that historical report.

## Player props

Prop model version 4 retains the 50% independent/50% market blend and adds predictive sample uncertainty, empirical hit-rate shrinkage, and overdispersed distributions for counts. Both sides of a paired market are evaluated. Existing pace, opponent, pressure, and snap evidence remain capped. Players listed out, suspended, on IR, or doubtful cannot qualify. At least five prior player game logs are required for a sportsbook betting recommendation; three logs can support a displayed projection.

Usage data remains limited by source coverage: NFL snaps are available, route participation and individual blocking grades are not; college advanced data needs CFBD_API_KEY. These limitations must not be presented as measured features.

## Operational checks

Focused tests cover look-ahead exclusion, line/price alignment, identical betting decisions across views, stale-data blocking, count distributions, calibration rejection on later outcomes, and separation of tracked/qualified records. Production refresh and prop workflows regenerate the audit after grading. Passing software checks does not prove profitable performance.
