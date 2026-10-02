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
