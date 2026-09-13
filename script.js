console.log("🏈 Gridiron Edge Model Loaded!");

// ============================================================
// GRIDIIRON EDGE — COLLEGE FOOTBALL PREDICTION ENGINE
// ============================================================

// ------------------------------------------------------------
// MONEYLINE → IMPLIED PROBABILITY
// ------------------------------------------------------------

function moneylineProbability(moneyline) {

```
if (isNaN(moneyline)) {
    return 0.50;
}

if (moneyline < 0) {

    return (
        -moneyline /
        (-moneyline + 100)
    );

} else {

    return (
        100 /
        (moneyline + 100)
    );

}
```

}

// ------------------------------------------------------------
// REMOVE SPORTSBOOK VIG
// ------------------------------------------------------------

function removeVig(homeProbability, awayProbability) {

```
const total =
    homeProbability +
    awayProbability;

return {

    home:
        homeProbability / total,

    away:
        awayProbability / total

};
```

}

// ------------------------------------------------------------
// MAIN MODEL
// ------------------------------------------------------------

function runPrediction() {

```
// --------------------------------------------------------
// GET INPUTS
// --------------------------------------------------------

const awayTeam =
    document.getElementById("awayTeam").value.trim();

const homeTeam =
    document.getElementById("homeTeam").value.trim();

const location =
    document.getElementById("gameLocation").value;

const spread =
    parseFloat(
        document.getElementById("spread").value
    );

const overUnder =
    parseFloat(
        document.getElementById("overUnder").value
    );

const homeMoneyline =
    parseFloat(
        document.getElementById("homeMoneyline").value
    );

const awayMoneyline =
    parseFloat(
        document.getElementById("awayMoneyline").value
    );


// --------------------------------------------------------
// VALIDATION
// --------------------------------------------------------

if (
    !awayTeam ||
    !homeTeam ||
    isNaN(spread) ||
    isNaN(overUnder) ||
    isNaN(homeMoneyline) ||
    isNaN(awayMoneyline)
) {

    alert(
        "Please enter all game information before running the model."
    );

    return;

}


// --------------------------------------------------------
// MARKET PROBABILITY
// --------------------------------------------------------

const rawHomeProbability =
    moneylineProbability(
        homeMoneyline
    );

const rawAwayProbability =
    moneylineProbability(
        awayMoneyline
    );


const market =
    removeVig(
        rawHomeProbability,
        rawAwayProbability
    );


// --------------------------------------------------------
// HOME FIELD ADVANTAGE
// --------------------------------------------------------

let homeFieldAdjustment = 0;

if (location === "home") {

    homeFieldAdjustment = 0.025;

}

if (location === "away") {

    homeFieldAdjustment = -0.025;

}

if (location === "neutral") {

    homeFieldAdjustment = 0;

}


// --------------------------------------------------------
// MODEL WIN PROBABILITY
// --------------------------------------------------------

/*
    CURRENT MODEL INPUTS:

    • Market probability
    • Betting spread
    • Home-field advantage

    FUTURE DATA INPUTS:

    • Offensive efficiency
    • Defensive efficiency
    • Strength of schedule
    • Recent form
    • Turnover margin
    • QB performance
    • Injuries
    • Rest
    • Weather
    • Pace
    • EPA
    • Success rate
    • Explosive plays
*/


let modelProbability =
    market.home;


// Home-field adjustment

modelProbability +=
    homeFieldAdjustment;


// Spread adjustment

modelProbability -=
    spread * 0.015;


// --------------------------------------------------------
// KEEP PROBABILITY BETWEEN 1% AND 99%
// --------------------------------------------------------

modelProbability =
    Math.max(
        0.01,
        Math.min(
            0.99,
            modelProbability
        )
    );


const awayModelProbability =
    1 -
    modelProbability;


// --------------------------------------------------------
// MODEL EDGE
// --------------------------------------------------------

const modelEdge =
    modelProbability -
    market.home;


// --------------------------------------------------------
// PROJECTED MARGIN
// --------------------------------------------------------

const projectedMargin =
    -spread * 0.85;


// --------------------------------------------------------
// PROJECTED TOTAL
// --------------------------------------------------------

const projectedTotal =
    overUnder;


// --------------------------------------------------------
// PROJECTED SCORES
// --------------------------------------------------------

let projectedHomeScore =
    (
        projectedTotal +
        projectedMargin
    ) / 2;


let projectedAwayScore =
    (
        projectedTotal -
        projectedMargin
    ) / 2;


projectedHomeScore =
    Math.max(
        0,
        projectedHomeScore
    );


projectedAwayScore =
    Math.max(
        0,
        projectedAwayScore
    );


// --------------------------------------------------------
// WINNER
// --------------------------------------------------------

const modelPick =
    modelProbability >= 0.50
        ? homeTeam
        : awayTeam;


// --------------------------------------------------------
// SPREAD PICK
// --------------------------------------------------------

let spreadPick;

if (
    projectedMargin >
    -spread
) {

    spreadPick =
        `${homeTeam} ${spread}`;

} else {

    spreadPick =
        `${awayTeam} ${-spread}`;

}


// --------------------------------------------------------
// TOTAL PICK
// --------------------------------------------------------

/*
    The current prototype uses the market total.

    The historical scoring model will eventually
    determine whether the predicted total is OVER
    or UNDER the sportsbook total.
*/


let totalPick;

if (
    projectedTotal >=
    overUnder
) {

    totalPick =
        `OVER ${overUnder}`;

} else {

    totalPick =
        `UNDER ${overUnder}`;

}


// --------------------------------------------------------
// UPDATE PAGE
// --------------------------------------------------------

document.getElementById(
    "matchupTitle"
).textContent =
    `${awayTeam} @ ${homeTeam}`;


document.getElementById(
    "winProbability"
).textContent =
    `${(
        modelProbability * 100
    ).toFixed(1)}%`;


document.getElementById(
    "marketProbability"
).textContent =
    `${(
        market.home * 100
    ).toFixed(1)}%`;


document.getElementById(
    "modelEdge"
).textContent =
    `${(
        modelEdge * 100
    ).toFixed(1)}%`;


document.getElementById(
    "predictedScore"
).textContent =
    `${awayTeam} ${Math.round(projectedAwayScore)} - ${homeTeam} ${Math.round(projectedHomeScore)}`;


document.getElementById(
    "modelPick"
).textContent =
    modelPick;


document.getElementById(
    "spreadPick"
).textContent =
    spreadPick;


document.getElementById(
    "totalPick"
).textContent =
    totalPick;


// --------------------------------------------------------
// MARKET INFORMATION
// --------------------------------------------------------

document.getElementById(
    "displaySpread"
).textContent =
    spread > 0
        ? `${homeTeam} +${spread}`
        : `${homeTeam} ${spread}`;


document.getElementById(
    "displayTotal"
).textContent =
    overUnder;


document.getElementById(
    "modelSpread"
).textContent =
    projectedMargin.toFixed(1);


document.getElementById(
    "spreadEdge"
).textContent =
    `${(
        projectedMargin +
        spread
    ).toFixed(1)}`;


document.getElementById(
    "predictedTotal"
).textContent =
    projectedTotal.toFixed(1);


document.getElementById(
    "totalEdge"
).textContent =
    "0.0";


// --------------------------------------------------------
// CONFIDENCE
// --------------------------------------------------------

const confidence =
    Math.abs(modelEdge) * 100;


const confidenceScore =
    Math.min(
```
