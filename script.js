const state = { games: [], odds: [], previous: new Map(), seconds: 60, timer: null };
const $ = id => document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function safeNewsUrl(value){try{const url=new URL(value);return url.protocol==="https:"?url.href:"#"}catch{return "#"}}

function setupFilters(){
  const now=new Date(); const currentYear=now.getFullYear();
  for(let y=currentYear-1;y<=currentYear+1;y++) $("season").add(new Option(y,y,y===currentYear,y===currentYear));
  for(let w=0;w<=16;w++) $("week").add(new Option(w===0?"Upcoming with odds":"Week "+w,w,w===0,w===0));
}
function fmtTime(value){return new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value))}
function signed(n){if(n==null)return "—";return `${n>0?"+":""}${n}`}
function american(n){if(n==null)return "—";return `${n>0?"+":""}${n}`}
function logo(url,name){return url?`<img class="team-logo" src="${esc(url)}" alt="${esc(name)} logo" loading="lazy">`:`<span class="team-logo fallback">${esc(String(name||"?").slice(0,2))}</span>`}
function bestMarkets(event){
  const chosen=$("bookFilter").value;
  const books=(event?.bookmakers||[]).filter(book=>chosen==="all"||book.key===chosen);
  const offers={spreads:[],totals:[],h2h:[]};
  books.forEach(book=>(book.markets||[]).forEach(m=>(m.outcomes||[]).forEach(outcome=>{
    if(offers[m.key])offers[m.key].push({...outcome,book:book.title,bookKey:book.key});
  })));
  if(chosen!=="all")return Object.fromEntries(Object.entries(offers).map(([key,outcomes])=>[key,{outcomes}]));
  const names=[...new Set(offers.spreads.map(o=>o.name))];
  const bestSpread=names.map(name=>offers.spreads.filter(o=>o.name===name).sort((a,b)=>(Number(b.point)-Number(a.point))||(Number(b.price)-Number(a.price)))[0]).filter(Boolean);
  const mlNames=[...new Set(offers.h2h.map(o=>o.name))];
  const bestMoneyline=mlNames.map(name=>offers.h2h.filter(o=>o.name===name).sort((a,b)=>Number(b.price)-Number(a.price))[0]).filter(Boolean);
  const over=offers.totals.filter(o=>o.name==="Over").sort((a,b)=>(Number(a.point)-Number(b.point))||(Number(b.price)-Number(a.price)))[0];
  const under=offers.totals.filter(o=>o.name==="Under").sort((a,b)=>(Number(b.point)-Number(a.point))||(Number(b.price)-Number(a.price)))[0];
  return {spreads:{outcomes:bestSpread},h2h:{outcomes:bestMoneyline},totals:{outcomes:[over,under].filter(Boolean)}};
}
function movementFor(id,markets){
  const spread=markets.spreads?.outcomes?.find(o=>o.name)?.point??null;
  const total=markets.totals?.outcomes?.find(o=>o.name==="Over")?.point??null;
  const old=state.previous.get(id); state.previous.set(id,{spread,total});
  if(!old)return {text:"Watching",cls:""};
  const ds=spread!=null&&old.spread!=null?spread-old.spread:0; const dt=total!=null&&old.total!=null?total-old.total:0;
  if(ds)return {text:`Spread ${signed(ds)}`,cls:ds>0?"change":"change negative"};
  if(dt)return {text:`Total ${signed(dt)}`,cls:dt>0?"change":"change negative"};
  return {text:"No change",cls:""};
}
function oddsEventFor(game){
  const a=(game.away||"").toLowerCase(),h=(game.home||"").toLowerCase();
  return state.odds.find(o=>o.away_team.toLowerCase()===a&&o.home_team.toLowerCase()===h);
}
function render(){
  const query=$("teamSearch").value.trim().toLowerCase(); let moves=0,withOdds=0;
  const list=state.games.filter(g=>!query||g.away.toLowerCase().includes(query)||g.home.toLowerCase().includes(query));
  $("games").innerHTML=list.map(g=>{
    const oe=oddsEventFor(g), m=bestMarkets(oe), move=movementFor(g.id,m); if(oe)withOdds++; if(move.cls)moves++;
    const spread=m.spreads?.outcomes||[], totals=m.totals?.outcomes||[], h2h=m.h2h?.outcomes||[];
    const awaySpread=spread.find(o=>o.name===g.away), homeSpread=spread.find(o=>o.name===g.home);
    const over=totals.find(o=>o.name==="Over"), under=totals.find(o=>o.name==="Under"), awayMl=h2h.find(o=>o.name===g.away), homeMl=h2h.find(o=>o.name===g.home);
    const offer=(outcome,label="")=>outcome?`${label}${label?" ":""}${outcome.point==null?"":signed(outcome.point)+" "}${american(outcome.price)} · ${esc(outcome.book||"")}`:"—";
    const p=g.prediction||{};
    const prediction=p.winner?`<div class="model-strip"><div><span>Gridiron Edge prediction</span><strong>${esc(p.winner)} · ${esc(g.away)} ${Number(p.awayScore)||0}–${esc(g.home)} ${Number(p.homeScore)||0}</strong></div><div><span>Model spread</span><strong>${esc(g.home)} ${signed(p.spread)}</strong></div><div><span>Model total</span><strong>${Number(p.total).toFixed(1)}</strong></div><div><span>Home win chance</span><strong>${Number(p.homeWin).toFixed(1)}%</strong></div><div class="probability"><span>Away ${Math.max(0,100-Number(p.homeWin)).toFixed(1)}%</span><i><b style="width:${Number(p.homeWin).toFixed(1)}%"></b></i><span>Home ${Number(p.homeWin).toFixed(1)}%</span></div><small>Based on season scoring and defensive results · ${Number(p.sample)||0} shared-game sample</small></div>`:"";
    const isFinal=/final/i.test(g.status||"");
    const wasPregame=p.createdAt&&new Date(p.createdAt)<new Date(g.date);
    const final=isFinal?`<div class="final-strip"><div><span>Actual final score</span><strong>${esc(g.away)} ${Number(g.awayScore)}–${esc(g.home)} ${Number(g.homeScore)}</strong></div><div><span>${wasPregame?"Pregame prediction":"Prediction comparison"}</span><strong>${wasPregame?`${esc(g.away)} ${Number(p.awayScore)}–${esc(g.home)} ${Number(p.homeScore)}`:"Available for games predicted before kickoff"}</strong></div></div>`:"";
    return `<article class="game" role="button" tabindex="0" data-game-id="${esc(g.id)}" aria-label="Open ${esc(g.away)} at ${esc(g.home)} details"><div class="matchup"><span class="kickoff">${esc(fmtTime(g.date))} · ${esc(g.status||"Scheduled")}</span><div class="teams"><div class="team">${logo(g.awayLogo,g.away)}<span>${esc(g.away)}</span><small>${awaySpread?signed(awaySpread.point):""}</small></div><div class="team">${logo(g.homeLogo,g.home)}<span>${esc(g.home)}</span><small>${homeSpread?signed(homeSpread.point):""}</small></div></div></div><div class="market"><span>Spread</span><strong>${homeSpread?`${esc(g.home)} ${signed(homeSpread.point)} (${american(homeSpread.price)})`:"—"}</strong><small>${homeSpread?esc(homeSpread.book):"Line unavailable"}${awaySpread?` · ${esc(g.away)} ${signed(awaySpread.point)} (${american(awaySpread.price)}) · ${esc(awaySpread.book)}`:""}</small></div><div class="market"><span>Total</span><strong>${over?`Over ${Number(over.point)} (${american(over.price)})`:"—"}</strong><small>${over?esc(over.book):"Line unavailable"}${under?` · Under ${Number(under.point)} (${american(under.price)}) · ${esc(under.book)}`:""}</small></div><div class="market"><span>Moneyline</span><strong>${awayMl?`${esc(g.away)} ${american(awayMl.price)} / ${esc(g.home)} ${american(homeMl?.price)}`:"—"}</strong><small>${awayMl?esc(awayMl.book):"Line unavailable"}${homeMl?` / ${esc(homeMl.book)}`:""}</small></div><div class="movement"><span>Since last refresh</span><strong class="${move.cls}">${esc(move.text)}</strong><small class="pill">60 sec</small></div>${prediction}${final}</article>`;
  }).join("");
  $("gameCount").textContent=list.length; $("oddsCount").textContent=withOdds; $("moveCount").textContent=moves;
  $("empty").classList.toggle("hidden",list.length>0);
}
function populateBooks(){
  const current=$("bookFilter").value; const books=new Map(); state.odds.forEach(e=>(e.bookmakers||[]).forEach(b=>books.set(b.key,b.title)));
  $("bookFilter").innerHTML='<option value="all">Best available</option>'+[...books].sort((a,b)=>a[1].localeCompare(b[1])).map(([k,v])=>`<option value="${k}">${v}</option>`).join("");
  if(books.has(current))$("bookFilter").value=current;
}
async function load(){
  $("loading").classList.remove("hidden"); $("notice").classList.add("hidden");
  try{
    const year=$("season").value,week=$("week").value;
    const response=await fetch(`data/live.json?t=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error("The live feed has not been generated yet.");
    const live=await response.json();
    state.odds=live.events||[]; $("dataCredit").textContent=`Schedules and scores: ESPN · Odds: ${live.oddsSource||"available sportsbook markets"}`;
    state.games=(live.games||[]).filter(g=>String(g.season)===String(year)&&(week==="0"?state.odds.some(o=>o.id===g.id):String(g.week)===String(week))).sort((a,b)=>new Date(a.date)-new Date(b.date));
    populateBooks();render();$("lastUpdated").textContent=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    $("connectionStatus").className="status live";$("connectionStatus").lastElementChild.textContent="Live data connected";
    if(live.updatedAt) $("lastUpdated").textContent=new Date(live.updatedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  }catch(e){showError(e.message+" Check the API setup and try again.")}
  finally{$("loading").classList.add("hidden");state.seconds=60}
}
function showError(message){$("loading").classList.add("hidden");$("notice").textContent=message+" The automatic updater will try again shortly.";$("notice").classList.remove("hidden");$("connectionStatus").className="status error";$("connectionStatus").lastElementChild.textContent="Feed is updating"}
function tick(){state.seconds--;if(state.seconds<=0)load();$("countdown").textContent=state.seconds+"s"}
function allBookRows(event){
  return (event?.bookmakers||[]).map(book=>{
    const markets=Object.fromEntries((book.markets||[]).map(m=>[m.key,m.outcomes||[]]));
    const spread=markets.spreads?.map(o=>`${esc(o.name)} ${signed(o.point)} (${american(o.price)})`).join(" · ")||"—";
    const total=markets.totals?.map(o=>`${esc(o.name)} ${o.point} (${american(o.price)})`).join(" · ")||"—";
    const moneyline=markets.h2h?.map(o=>`${esc(o.name)} ${american(o.price)}`).join(" · ")||"—";
    return `<tr><th>${esc(book.title)}</th><td>${spread}</td><td>${total}</td><td>${moneyline}</td></tr>`;
  }).join("");
}
function playerTables(summary){
  const teams=summary?.boxscore?.players||[];
  if(!teams.length)return '<div class="detail-empty">Player box-score statistics become available when ESPN publishes them for this game.</div>';
  return teams.map(team=>{
    const groups=(team.statistics||[]).slice(0,4).map(group=>{
      const labels=group.labels||group.names||[];
      const athletes=(group.athletes||[]).slice(0,8);
      if(!athletes.length)return "";
      return `<div class="player-group"><h4>${esc(group.name||group.type||"Players")}</h4><div class="table-scroll"><table><thead><tr><th>Player</th>${labels.map(label=>`<th>${esc(label)}</th>`).join("")}</tr></thead><tbody>${athletes.map(row=>`<tr><td>${esc(row.athlete?.displayName||row.athlete?.shortName||"Player")}</td>${(row.stats||[]).map(value=>`<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
    }).join("");
    return `<section class="player-team"><h3>${esc(team.team?.displayName||team.team?.name||"Team")} player stats</h3>${groups}</section>`;
  }).join("");
}
async function openGame(id){
  const game=state.games.find(item=>String(item.id)===String(id));if(!game)return;
  const event=oddsEventFor(game),p=game.prediction||{},homeWin=Number(p.homeWin)||50,awayWin=100-homeWin;
  const dialog=$("gameDialog");
  $("detailBody").innerHTML=`<div class="detail-loading"><span class="eyebrow">MATCHUP ROOM</span><h2>${esc(game.away)} at ${esc(game.home)}</h2><p>Loading game statistics…</p></div>`;
  dialog.showModal();
  let summary=null;
  try{const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${encodeURIComponent(game.id)}`);if(response.ok)summary=await response.json()}catch{}
  const metrics=[
    ["Avg points scored",p.awayOffense,p.homeOffense],
    ["Avg points allowed",p.awayDefense,p.homeDefense],
    ["Projected points",p.awayScore,p.homeScore],
    ["Win probability",awayWin.toFixed(1)+"%",homeWin.toFixed(1)+"%"]
  ];
  $("detailBody").innerHTML=`
    <header class="detail-head"><span class="eyebrow">THE MATCHUP ROOM</span><h2>${esc(game.away)} at ${esc(game.home)}</h2><p>${esc(fmtTime(game.date))} · ${esc(game.status||"Scheduled")}</p></header>
    <section class="score-projection">
      <div>${logo(game.awayLogo,game.away)}<h3>${esc(game.away)}</h3><strong>${Number(p.awayScore)||0}</strong><small>${awayWin.toFixed(1)}% win chance</small></div>
      <span>VS</span>
      <div>${logo(game.homeLogo,game.home)}<h3>${esc(game.home)}</h3><strong>${Number(p.homeScore)||0}</strong><small>${homeWin.toFixed(1)}% win chance</small></div>
      <div class="detail-probability"><i style="width:${awayWin}%"></i><i style="width:${homeWin}%"></i></div>
    </section>
    <section class="detail-section"><div class="section-title"><span class="eyebrow">MODEL COMPARISON</span><h3>Head to head</h3></div><div class="comparison"><div class="comparison-head"><b>${esc(game.away)}</b><span>Metric</span><b>${esc(game.home)}</b></div>${metrics.map(row=>`<div><strong>${esc(row[1]??"—")}</strong><span>${esc(row[0])}</span><strong>${esc(row[2]??"—")}</strong></div>`).join("")}</div><p class="method-note">Scoring and defense figures are calculated from completed games in the selected season. Exact zone/man-coverage grades are not supplied by the connected feeds.</p></section>
    <section class="detail-section"><div class="section-title"><span class="eyebrow">SPORTSBOOKS</span><h3>Every available line</h3></div><div class="table-scroll"><table class="odds-table"><thead><tr><th>Book</th><th>Spread</th><th>Total</th><th>Moneyline</th></tr></thead><tbody>${allBookRows(event)||'<tr><td colspan="4">No current markets</td></tr>'}</tbody></table></div></section>
    <section class="detail-section"><div class="section-title"><span class="eyebrow">ESPN BOX SCORE</span><h3>Player statistics</h3></div>${playerTables(summary)}</section>`;
}
$("games").addEventListener("click",event=>{const card=event.target.closest(".game");if(card)openGame(card.dataset.gameId)});
$("games").addEventListener("keydown",event=>{if((event.key==="Enter"||event.key===" ")&&event.target.matches(".game")){event.preventDefault();openGame(event.target.dataset.gameId)}});
$("closeDialog").addEventListener("click",()=>$("gameDialog").close());
$("gameDialog").addEventListener("click",event=>{if(event.target===$("gameDialog"))$("gameDialog").close()});

setupFilters();$("season").addEventListener("change",load);$("week").addEventListener("change",load);$("bookFilter").addEventListener("change",render);$("teamSearch").addEventListener("input",render);$("refreshBtn").addEventListener("click",load);state.timer=setInterval(tick,1000);load();
