# Player and situational model context

CFB version 12 and NFL version 13 extend the existing scoring model. Market anchoring and locked forecasts after kickoff remain.

## Active evidence

- Player injury values use preceding game opportunities, workload share, per-opportunity efficiency and observed backup production when available. Otherwise the position prior remains. Production opportunities are not snap shares. Historical games with changed offensive personnel or confirmed defensive absences get less rating weight.
- Rushing and passing success use 40% of required yards on first down, 60% on second and 100% on third/fourth. Kneels, spikes, penalties and defined garbage time are excluded. Defensive success residuals compare opponents' production with those opponents' earlier games.
- Sacks allowed/generated inform a bounded line-matchup adjustment. QB hits are saved as evidence. This feed lacks true pressure rates, run-blocking grades or tracking-based rushing yards over expected.
- Possession counts are compared with the preceding season sample's league environment. Competitive clock intervals and leading/tied/trailing pass rates are saved. Props receive small pace and opponent-efficiency adjustments only when evidence exists.
- Red-zone TD rates are shrunk toward the preceding league sample. Return touchdowns and short-field scoring are partially removed from historical scoring ratings. Actual scores, grading and records stay unchanged.
- Context adjustments are bounded and shrink with small samples. They have not been trained to maximize betting results.

## Evaluation

Every new pregame forecast records its calculation time, paired previous-feature baseline, context evidence, side-specific quoted prices and latest pregame consensus. The first paired forecast within seven days of a game is saved per model version.

Run node scripts/validate-model.mjs to write:

- data/model-snapshots.json: preserved paired forecasts.
- data/model-validation.json: forward error/probability comparisons, recorded-price profit and ROI, point-based closing-line value, and a separate chronological scoring-feature experiment.

The chronological experiment rebuilds scoring ratings from strictly earlier games. It excludes market blending, live injuries and weather and must not be presented as a replay of the full production model. Forward results are needed to assess that model. Profits describe all archived forecasts, not a filtered betting card. Missing quote prices or closing lines are excluded.

EPA, actual snap counts, true pressures, run-blocking grades and unseen replacement-player ability are explicitly unavailable. Defensive player value remains a position prior where reliable participation/quality evidence does not exist. A missing tackle is never interpreted as absence. These require additional data feeds; no synthetic substitute is labelled as the real metric.

Run node --test tests/model-context.test.mjs before updating the model.


## Added personnel feeds (CFB v13 / NFL v14)

NFL enrichment uses current-season public nflverse snap counts, PFR passing/rushing advanced stats, nflfastR play-by-play and FTN charting. Sources are refreshed at most every six hours and failures retain cached metrics; a failed refresh is retried after 30 minutes. FTN Data via nflverse is attributed under CC-BY-SA 4.0. Per-game NFL snap coverage can discount historical games with missing regular offensive or defensive players. These are observed snap changes, not inferred injury diagnoses.

ESPN depth charts/rosters provide current starter/backup and head-coach context where published. Changes in observed coach, depth-chart starters or schemes reduce the relevance of older results. Historical coaching changes before snapshots began remain unknown. NFL pressures, yards before contact, competitive EPA and blitz-conditioned EPA support capped adjustments. Yards before contact are not an offensive-line grade. Route participation, coverage man/zone and blocking grades remain unavailable.

Special teams use NFL field-goal results relative to nflfastR expected make probability, net punt evidence and recorded returns. College kicking/average punting evidence is saved from ESPN where present. Effects are modest because scoring ratings already contain some special-teams effects.

An optional CollegeFootballData importer reads CFBD_API_KEY from the environment and fetches advanced game PPA and line yards. Without this separate credential, it is marked not connected. PPA is retained under its actual name; it is not labelled NFL EPA. No account or subscription is created by the model.

Freshness is measured from sportsbook quote timestamps and cached injury timestamps, not the output file's write time. Stale/missing quotes and sufficiently stale injury reports block bet eligibility; unknown injury/history coverage reduces reliability. Game details, Top 10 game plays and Top 10 props honor the quality gate. Archived pregame forecasts stay locked; their current runtime age can prevent new bets without changing grading.
