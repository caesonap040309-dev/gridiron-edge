(()=>{
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const pct=value=>Number.isFinite(Number(value))?`${Number(value).toFixed(1)}%`:"—";
  const confidence=prob=>prob>=62?"High":prob>=56?"Medium":"Low";
  const unitLabel=row=>row.units===3?"3 Units · Strongest":row.units===2?"2 Units · Strong":row.units===1?"1 Unit · Lean":"NO BET · Pass";
  const stakeFor=row=>globalThis.GridironPolicy.stake(row);
  const injuryContext=(game,p)=>{const impact=p?.injuryImpact;if(!impact||(!(impact.homeCount||impact.awayCount)))return "";const swing=Number(p.adjustments?.injuryMargin)||0;return ` Injury weighting moves the home-team margin ${swing>=0?"+":""}${swing.toFixed(1)} points; availability uncertainty is ${Number(impact.uncertainty||0).toFixed(1)}.`};
  const quality=books=>books>=3?{label:"Strong",weight:1}:books>=2?{label:"Good",weight:.9}:{label:"Limited",weight:.72};
  const upcoming=value=>{const time=new Date(value).getTime();return Number.isFinite(time)&&time>Date.now()-90*60000};
  const probability=value=>value==null||value===""?null:(Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<100?Number(value):null);

  const matchupKey=(away,home)=>`${String(away||"").trim()}|${String(home||"").trim()}`;
  const clean=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const odds=value=>{const n=Number(value);return Number.isFinite(n)?(n>0?`+${n}`:`${n}`):"—"};
  const impliedProbability=value=>{const n=Number(value);if(!Number.isFinite(n)||n===0)return null;return n<0?(-n)/(-n+100)*100:100/(n+100)*100};
  const eventFor=(events,game)=>(events||[]).find(event=>clean(event.home_team)===clean(game.home)&&clean(event.away_team)===clean(game.away));
  function bestPrice(events,game,key,name,point=null){
    const event=eventFor(events,game),offers=[];
    const fresh=new Set(event?.freshBookmakers||[]);
    for(const book of event?.bookmakers||[])if(fresh.has(clean(book.title||book.key)))for(const market of book.markets||[])if(market.key===key)for(const outcome of market.outcomes||[]){
      if(clean(outcome.name)!==clean(name)||!Number.isFinite(Number(outcome.price)))continue;
      if(point!=null&&Number.isFinite(Number(outcome.point))&&Math.abs(Number(outcome.point)-Number(point))>.01)continue;
      offers.push(Number(outcome.price));
    }
    return offers.length?Math.max(...offers):null;
  }
  const standardPrice=price=>Number.isFinite(Number(price))&&Number(price)>=-125&&Number(price)<=125;
  function consensusOffer(events,game,key,name){
    const event=eventFor(events,game),offers=[];
    const fresh=new Set(event?.freshBookmakers||[]);
    for(const book of event?.bookmakers||[])if(fresh.has(clean(book.title||book.key)))for(const market of book.markets||[])if(market.key===key)for(const outcome of market.outcomes||[]){
      if(clean(outcome.name)!==clean(name)||!Number.isFinite(Number(outcome.point))||!Number.isFinite(Number(outcome.price)))continue;
      offers.push({point:Number(outcome.point),price:Number(outcome.price),book:book.title||book.key});
    }
    if(new Set(offers.map(offer=>offer.book)).size<2)return null;
    const counts=new Map();for(const offer of offers)counts.set(offer.point,(counts.get(offer.point)||0)+1);
    const consensus=[...counts.entries()].sort((a,b)=>b[1]-a[1]||Math.abs(a[0])-Math.abs(b[0]))[0]?.[0];
    return offers.filter(offer=>offer.point===consensus).sort((a,b)=>b.price-a.price)[0]||null;
  }
  let selectedSource="combined";
  const sourceLabel=()=>selectedSource==="props"?"Player Prop":selectedSource==="games"?"Game":"Game + Player Prop";

  function rememberSource(source){
    if(source!=="games"&&source!=="props"&&source!=="combined")return;
    selectedSource=source;
    localStorage.setItem("gridiron-ai-source",source);
    const button=document.querySelector('[data-market-view="ai"]');
    if(button)button.textContent=source==="props"?"Top 10 Prop Plays":source==="games"?"Top 10 Game Plays":"Top 10 AI Plays";
  }

  function gameCandidates(games,events){
    return (games||[]).flatMap(game=>globalThis.GridironPolicy.gameRows(game,events)).filter(row=>row.units>0).map(row=>({...row,why:`The model estimates ${pct(row.prob)} at ${odds(row.price)} from ${row.book}, with ${row.valueEdge.toFixed(1)} percentage points above the price's break-even probability.`}));
  }
  function propCandidates(data,weeklyMatchups){
    const best=new Map();
    for(const prop of data?.props||[]){
      if(!weeklyMatchups.has(matchupKey(prop.away,prop.home)))continue;
      const row=globalThis.GridironPolicy.propRow(prop);if(!row.units)continue;
      row.why=`Projection: ${prop.modelProjection??"—"}; ${row.modelSample} prior games. ${row.valueEdge.toFixed(1)} percentage points above the sportsbook price's break-even probability.`;
      const key=`${prop.eventId}|${prop.player}|${prop.market}|${prop.pick}`;
      if(!best.has(key)||row.valueEdge>best.get(key).valueEdge)best.set(key,row);
    }
    return [...best.values()];
  }

  function installStyles(){if(document.getElementById("ai-play-styles"))return;const style=document.createElement("style");style.id="ai-play-styles";style.textContent=`
    .ai-shell{padding:22px 0 44px}.ai-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}.ai-week-control{display:grid;gap:5px;min-width:150px}.ai-week-control span{color:var(--muted);font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.ai-week-control select{border:1px solid var(--line);border-radius:10px;background:var(--panel);color:inherit;padding:9px 12px;font:inherit;font-weight:700}.ai-head h2{margin:4px 0 0}.ai-head p{max-width:620px;margin:0;color:var(--muted);line-height:1.55}.ai-list{display:grid;gap:12px}.ai-play{display:grid;grid-template-columns:54px minmax(0,1.5fr) minmax(120px,.65fr) minmax(120px,.65fr);gap:14px;align-items:center;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow)}.ai-rank{display:grid;place-items:center;width:44px;height:44px;border-radius:13px;background:#0879e6;color:#fff;font-size:1.05rem;font-weight:900}.ai-copy small,.ai-metric span{display:block;color:var(--muted);font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.ai-copy h3{margin:4px 0;font-size:1.05rem}.ai-copy p{margin:0;color:var(--muted);font-size:.8rem;line-height:1.45}.ai-metric strong{display:block;margin:5px 0 2px;font-size:1rem}.ai-quality{font-size:.72rem;color:var(--muted)}.ai-empty{padding:36px;border:1px solid var(--line);border-radius:16px;background:var(--panel);text-align:center;color:var(--muted)}body.theme-dark .ai-rank{background:#168cff}@media(max-width:720px){.ai-head{display:block}.ai-head>p{margin-top:8px}.ai-play{grid-template-columns:48px 1fr}.ai-metric{grid-column:2}}
  `;document.head.appendChild(style)}

  function ensureUi(){
    if(!document.querySelector('[data-market-view="ai"]'))document.querySelector(".market-mode-tabs")?.insertAdjacentHTML("beforeend",'<button class="market-mode-tab" type="button" role="tab" aria-selected="false" data-market-view="ai">Top 10 AI Plays</button>');
    if(!document.getElementById("aiView"))document.getElementById("propsView")?.insertAdjacentHTML("afterend",'<div id="aiView" class="view-hidden"><section class="ai-shell"><div class="ai-head"><div><p class="eyebrow">GRIDIRON EDGE 2.0</p><h2 id="aiTitle">Top 10 AI Plays</h2></div><label class="ai-week-control"><span>Week</span><select id="aiWeek" aria-label="AI plays week"></select></label><p id="aiNote">Ranking the strongest eligible pregame plays.</p></div><div id="aiPlays" class="ai-list" aria-live="polite"><div class="ai-empty">Loading the strongest available plays…</div></div></section></div>');
    const week=document.getElementById("aiWeek");if(week&&!week.dataset.aiBound){week.dataset.aiBound="true";week.addEventListener("change",load)}
    document.querySelectorAll('[data-market-view="games"],[data-market-view="props"]').forEach(sourceButton=>{if(sourceButton.dataset.aiSourceBound)return;sourceButton.dataset.aiSourceBound="true";sourceButton.addEventListener("click",()=>{rememberSource(sourceButton.dataset.marketView);document.getElementById("aiView")?.classList.add("view-hidden")})});
    rememberSource("combined");
    const button=document.querySelector('[data-market-view="ai"]');if(button&&!button.dataset.aiBound){button.dataset.aiBound="true";button.addEventListener("click",()=>{document.getElementById("gamesView")?.classList.add("view-hidden");document.getElementById("propsView")?.classList.add("view-hidden");document.getElementById("aiView")?.classList.remove("view-hidden");document.querySelectorAll("[data-market-view]").forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-selected",active?"true":"false")});load()})}
  }

  async function load(){
    installStyles();ensureUi();const league=localStorage.getItem("gridiron-league")==="nfl"?"nfl":"cfb",label=league==="nfl"?"NFL":"College Football",stamp=Date.now();
    const [games,props]=await Promise.all([fetch(`${league==="nfl"?"data/nfl.json":"data/live.json"}?v=${stamp}`,{cache:"no-store"}).then(r=>r.json()),fetch(`data/${league==="nfl"?"props-nfl.json":"props-cfb.json"}?v=${stamp}`,{cache:"no-store"}).then(r=>r.json()).catch(()=>({props:[]}))]);
    const season=String(document.getElementById("season")?.value||new Date().getFullYear()),allGames=(games?.games||[]).filter(game=>String(game.season)===season);
    const availableWeeks=[...new Set(allGames.filter(game=>upcoming(game.date)).map(game=>Number(game.week)).filter(Number.isFinite))].sort((a,b)=>a-b);
    const weekSelect=document.getElementById("aiWeek"),mainWeek=document.getElementById("week")?.value;
    if(weekSelect){const previous=weekSelect.value,preferred=previous||((mainWeek&&mainWeek!=="0")?mainWeek:String(availableWeeks[0]??""));weekSelect.innerHTML=availableWeeks.map(week=>`<option value="${week}">Week ${week}</option>`).join("");if(availableWeeks.some(week=>String(week)===String(preferred)))weekSelect.value=String(preferred)}
    const selectedWeek=String(weekSelect?.value||availableWeeks[0]||""),weeklyGames=allGames.filter(game=>String(game.week)===selectedWeek&&upcoming(game.date));
    const weeklyMatchups=new Set(weeklyGames.map(game=>matchupKey(game.away,game.home)));
    const candidates=selectedSource==="props"?propCandidates(props,weeklyMatchups):selectedSource==="games"?gameCandidates(weeklyGames,games?.events||[],games?.multiBookUpdatedAt): [...gameCandidates(weeklyGames,games?.events||[],games?.multiBookUpdatedAt),...propCandidates(props,weeklyMatchups)];
    const ranked=candidates.map(row=>{const value=Number(row.valueEdge),base=Number.isFinite(value)?value:Math.max(Number(row.edge)||0,Math.abs(Number(row.prob)-50));const units=stakeFor(row),riskPenalty=(Number(row.uncertainty)||0)*.7+(Number(row.disagreement)||0)*.6;return {...row,units,score:base*row.q.weight-riskPenalty}}).filter(row=>row.units>0).sort((a,b)=>b.units-a.units||b.score-a.score||b.prob-a.prob);
    const plays=[];const usedGames=new Set();for(const row of ranked){if(row.type!=="Player Prop"&&usedGames.has(row.matchup))continue;plays.push(row);if(row.type!=="Player Prop")usedGames.add(row.matchup);if(plays.length===10)break}
    const source=sourceLabel(),title=document.getElementById("aiTitle"),list=document.getElementById("aiPlays"),note=document.getElementById("aiNote");if(title)title.textContent=`${label} Week ${selectedWeek} Qualified ${source} Plays (${plays.length})`;if(note)note.textContent=selectedSource==="props"?"Only player props that clear the minimum sample, probability, and value thresholds are shown.":selectedSource==="games"?"Only games that clear probability, edge, multi-book, stability, and injury-uncertainty thresholds are shown. At most one play per matchup qualifies.":"A selective board of plays that clear every betting threshold. The board may contain fewer than 10 plays; weak spots are withheld instead of being promoted.";if(!list)return;
    list.innerHTML=plays.length?plays.map((p,i)=>`<article class="ai-play"><div class="ai-rank">#${i+1}</div><div class="ai-copy"><small>${esc(p.type)} · ${esc(p.matchup)}</small><h3>${esc(p.pick)}${p.price!=null?` (${esc(odds(p.price))})`:""}</h3><p>${esc(p.why)}</p></div><div class="ai-metric"><span>Estimated probability</span><strong>${pct(p.prob)}</strong><small class="result-badge ${String(p.tier||confidence(p.prob)).toLowerCase()}">${p.tier||confidence(p.prob)}</small></div><div class="ai-metric"><span>Bet rating</span><strong>${unitLabel(p)}</strong><small class="ai-quality">${p.units===0?"Model edge is below the bet threshold":`${p.valueEdge!=null?"Value":"Edge"} ${Number(p.valueEdge??p.edge).toFixed(1)}${p.valueEdge!=null||p.type==="Player Prop"||p.type==="Moneyline"?"%":" pts"} · ${p.q.label} data`}</small></div></article>`).join(""):`<div class="ai-empty">No eligible ${esc(source.toLowerCase())} plays are available for ${esc(label)} Week ${esc(selectedWeek)} right now.</div>`;
  }
  window.gridironAI={load};
  installStyles();ensureUi();
  document.querySelectorAll(".league-tab").forEach(button=>button.addEventListener("click",()=>setTimeout(()=>{if(!document.getElementById("aiView")?.classList.contains("view-hidden"))load()},150)));
})();
