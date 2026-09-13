* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

:root {
    --bg: #070b11;
    --panel: #101722;
    --panel2: #0c121b;
    --border: #24303e;
    --text: #f5f7fa;
    --muted: #8b97a8;
    --green: #39ff88;
    --green-dark: #0e2418;
}


/* PAGE */

body {
    font-family: Arial, Helvetica, sans-serif;

    background:
        radial-gradient(
            circle at top right,
            #12202d 0,
            var(--bg) 40%
        );

    color: var(--text);

    min-height: 100vh;
}


/* HEADER */

.topbar {
    min-height: 78px;

    padding: 15px 5%;

    background: rgba(9, 13, 20, 0.96);

    border-bottom: 1px solid var(--border);

    display: flex;

    align-items: center;

    justify-content: space-between;

    gap: 20px;
}


.brand {
    display: flex;

    align-items: center;

    gap: 12px;
}


.logo {
    width: 45px;

    height: 45px;

    display: grid;

    place-items: center;

    border-radius: 12px;

    background: var(--green-dark);

    border: 1px solid #31513f;

    font-size: 22px;
}


.brand h1 {
    color: var(--green);

    font-size: 23px;
}


.brand p {
    color: var(--muted);

    font-size: 12px;

    margin-top: 2px;
}


.status {
    border: 1px solid var(--border);

    background: var(--panel2);

    color: var(--muted);

    border-radius: 999px;

    padding: 8px 12px;

    font-size: 10px;

    font-weight: 700;

    letter-spacing: 1px;
}


.dot {
    display: inline-block;

    width: 7px;

    height: 7px;

    margin-right: 7px;

    border-radius: 50%;

    background: var(--green);

    box-shadow: 0 0 9px var(--green);
}


/* MAIN */

.container {
    width: 92%;

    max-width: 1250px;

    margin: 34px auto 70px;
}


/* HERO */

.hero {
    padding: 36px;

    margin-bottom: 22px;

    border: 1px solid var(--border);

    border-radius: 18px;

    background:
        linear-gradient(
            135deg,
            #121d29,
            #0b1018
        );

    display: flex;

    justify-content: space-between;

    align-items: center;

    gap: 30px;
}


.eyebrow {
    color: var(--green);

    font-size: 10px;

    font-weight: 800;

    letter-spacing: 1.5px;
}


.hero h2 {
    font-size: clamp(28px, 4vw, 42px);

    margin: 7px 0 10px;
}


.hero p:not(.eyebrow) {
    color: var(--muted);

    max-width: 720px;

    line-height: 1.6;
}


.hero-badge {
    min-width: 125px;

    padding: 20px;

    text-align: center;

    background: var(--green-dark);

    border: 1px solid #31513f;

    border-radius: 14px;
}


.hero-badge strong {
    display: block;

    color: var(--green);

    font-size: 25px;
}


.hero-badge span {
    color: var(--muted);

    font-size: 9px;

    letter-spacing: 1.5px;
}


/* CARDS */

.card {
    background: rgba(16, 23, 34, 0.96);

    border: 1px solid var(--border);

    border-radius: 16px;

    padding: 25px;

    margin-bottom: 20px;
}


.section-head {
    display: flex;

    justify-content: space-between;

    align-items: center;

    gap: 15px;

    margin-bottom: 22px;
}


.section-head h2 {
    font-size: 21px;

    margin-top: 5px;
}


/* BUTTONS */

.primary-btn,
.secondary-btn {
    border-radius: 9px;

    cursor: pointer;

    font-weight: 800;
}


.primary-btn {
    width: 100%;

    margin-top: 20px;

    padding: 14px 18px;

    border: 0;

    background: var(--green);

    color: #06100a;

    font-size: 15px;

    display: flex;

    justify-content: space-between;

    align-items: center;
}


.primary-btn:hover {
    transform: translateY(-1px);

    filter: brightness(1.05);
}


.secondary-btn {
    padding: 9px 13px;

    background: transparent;

    color: var(--muted);

    border: 1px solid var(--border);
}


.secondary-btn:hover {
    color: var(--green);

    border-color: var(--green);
}


/* FORM */

.form-grid {
    display: grid;

    grid-template-columns: repeat(3, 1fr);

    gap: 16px;
}


label {
    color: var(--muted);

    font-size: 12px;
}


input,
select {
    width: 100%;

    margin-top: 7px;

    padding: 12px 13px;

    border-radius: 9px;

    border: 1px solid #293545;

    background: #080d14;

    color: var(--text);

    outline: none;

    font-size: 14px;
}


input:focus,
select:focus {
    border-color: var(--green);

    box-shadow:
        0 0 0 2px rgba(57, 255, 136, 0.08);
}


.note {
    color: #687586;

    font-size: 10px;

    text-align: center;

    margin-top: 10px;
}


/* RESULTS */

.hidden {
    display: none;
}


.result-head {
    margin-top: 30px;
}


.confidence-pill {
    border: 1px solid var(--border);

    background: var(--panel2);

    color: var(--muted);

    border-radius: 999px;

    padding: 8px 12px;

    font-size: 10px;

    font-weight: 700;
}


/* METRICS */

.metrics {
    display: grid;

    grid-template-columns: repeat(4, 1fr);

    gap: 14px;

    margin-bottom: 14px;
}


.metric {
    background: var(--panel);

    border: 1px solid var(--border);

    border-radius: 14px;

    padding: 20px;

    min-height: 135px;

    display: flex;

    flex-direction: column;

    justify-content: center;
}


.metric.featured {
    border-color: #2c8c56;

    background:
        linear-gradient(
            145deg,
            #102319,
            var(--panel)
        );
}


.metric span,
.picks span {
    color: var(--muted);

    font-size: 10px;

    letter-spacing: 1px;

    font-weight: 800;
}


.metric strong {
    color: var(--green);

    font-size: 27px;

    margin-top: 9px;

    line-height: 1.15;
}


.metric small {
    color: #687586;

    font-size: 10px;

    margin-top: 8px;
}


/* PICKS */

.picks {
    display: grid;

    grid-template-columns: repeat(3, 1fr);

    gap: 14px;

    margin-bottom: 20px;
}


.picks article {
    background: var(--panel2);

    border: 1px solid var(--border);

    border-radius: 13px;

    padding: 18px;
}


.picks strong {
    display: block;

    font-size: 19px;

    margin-top: 6px;
}


/* TWO COLUMNS */

.two-col {
    display: grid;

    grid-template-columns: 1fr 1fr;

    gap: 20px;
}


/* DATA LIST */

.list {
    margin-top: 17px;

    border: 1px solid var(--border);

    border-radius: 10px;

    overflow: hidden;
}


.list div {
    display: flex;

    justify-content: space-between;

    gap: 15px;

    padding: 12px 14px;

    background: #0c121b;

    border-bottom: 1px solid var(--border);

    font-size: 12px;
}


.list div:last-child {
    border-bottom: 0;
}


.list span {
    color: var(--muted);
}


.list b {
    color: #e9edf2;
}


/* CONFIDENCE */

.confidence {
    display: grid;

    grid-template-columns: 1fr 360px;

    align-items: center;

    gap: 30px;
}


.confidence h2 {
    font-size: 20px;

    margin: 5px 0;
}


.confidence p:not(.eyebrow) {
    color: var(--muted);

    font-size: 12px;
}


.meter-row {
    display: flex;

    align-items: center;

    gap: 12px;
}


.meter {
    height: 10px;

    flex: 1;

    background: #222d3b;

    border-radius: 99px;

    overflow: hidden;
}


.meter div {
    height: 100%;

    width: 0;

    background: var(--green);

    transition: width 0.5s ease;
}


.meter-row strong {
    color: var(--green);

    min-width: 40px;

    text-align: right;
}


/* FOOTER */

footer {
    border-top: 1px solid var(--border);

    padding: 26px;

    text-align: center;

    color: var(--green);
}


footer span {
    display: block;

    color: #657182;

    font-size: 10px;

    margin-top: 4px;
}


/* MOBILE */

@media (max-width: 900px) {

    .form-grid,
    .metrics {
        grid-template-columns: repeat(2, 1fr);
    }

    .two-col,
    .confidence {
        grid-template-columns: 1fr;
    }

}


@media (max-width: 600px) {

    .topbar,
    .hero {
        flex-direction: column;

        align-items: flex-start;
    }

    .hero-badge {
        width: 100%;
    }

    .form-grid,
    .metrics,
    .picks {
        grid-template-columns: 1fr;
    }

    .container {
        width: 94%;

        margin-top: 20px;
    }

    .card,
    .hero {
        padding: 19px;
    }

}
