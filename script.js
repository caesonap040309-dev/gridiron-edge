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
function bestMarkets(event){
  const chosen=$("bookFilter").value; const books=event?.bookmakers||[];
  const pool=chosen==="all"?books:books.filter(b=>b.key===chosen);
  const rows={};
  pool.forEach(book=>book.markets.forEach(m=>{ if(!rows[m.key]) rows[m.key]={book:book.title,outcomes:m.outcomes}; }));
  return rows;
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
    const over=totals.find(o=>o.name==="Over"), awayMl=h2h.find(o=>o.name===g.away), homeMl=h2h.find(o=>o.name===g.home);
    const p=g.prediction||{};
    const prediction=p.winner?`<div class="model-strip"><div><span>Gridiron Edge prediction</span><strong>${esc(p.winner)} · ${esc(g.away)} ${Number(p.awayScore)||0}–${esc(g.home)} ${Number(p.homeScore)||0}</strong></div><div><span>Model spread</span><strong>${esc(g.home)} ${signed(p.spread)}</strong></div><div><span>Model total</span><strong>${Number(p.total).toFixed(1)}</strong></div><div><span>Home win chance</span><strong>${Number(p.homeWin).toFixed(1)}%</strong></div><small>Based on season scoring and defensive results · ${Number(p.sample)||0} shared-game sample</small></div>`:"";
    const isFinal=/final/i.test(g.status||"");
    const wasPregame=p.createdAt&&new Date(p.createdAt)<new Date(g.date);
    const final=isFinal?`<div class="final-strip"><div><span>Actual final score</span><strong>${esc(g.away)} ${Number(g.awayScore)}–${esc(g.home)} ${Number(g.homeScore)}</strong></div><div><span>${wasPregame?"Pregame prediction":"Prediction comparison"}</span><strong>${wasPregame?`${esc(g.away)} ${Number(p.awayScore)}–${esc(g.home)} ${Number(p.homeScore)}`:"Available for games predicted before kickoff"}</strong></div></div>`:"";
    return `<article class="game"><div class="matchup"><span class="kickoff">${esc(fmtTime(g.date))} · ${esc(g.status||"Scheduled")}</span><div class="teams"><div class="team"><span>${esc(g.away)}</span><small>${awaySpread?signed(awaySpread.point):""}</small></div><div class="team"><span>${esc(g.home)}</span><small>${homeSpread?signed(homeSpread.point):""}</small></div></div></div><div class="market"><span>Spread</span><strong>${homeSpread?`${esc(g.home)} ${signed(homeSpread.point)} (${american(homeSpread.price)})`:"—"}</strong><small>${esc(m.spreads?.book||"Line unavailable")}</small></div><div class="market"><span>Total</span><strong>${over?`O/U ${Number(over.point)}`:"—"}</strong><small>${esc(m.totals?.book||"Line unavailable")}</small></div><div class="market"><span>Moneyline</span><strong>${awayMl?`${american(awayMl.price)} / ${american(homeMl?.price)}`:"—"}</strong><small>${esc(m.h2h?.book||"Line unavailable")}</small></div><div class="movement"><span>Since last refresh</span><strong class="${move.cls}">${esc(move.text)}</strong><small class="pill">60 sec</small></div>${prediction}${final}</article>`;
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
    state.odds=live.events||[];
    state.games=(live.games||[]).filter(g=>String(g.season)===String(year)&&(week==="0"?state.odds.some(o=>o.id===g.id):String(g.week)===String(week))).sort((a,b)=>new Date(a.date)-new Date(b.date));
    populateBooks();render();$("lastUpdated").textContent=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    $("connectionStatus").className="status live";$("connectionStatus").lastElementChild.textContent="Live data connected";
    if(live.updatedAt) $("lastUpdated").textContent=new Date(live.updatedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  }catch(e){showError(e.message+" Check the API setup and try again.")}
  finally{$("loading").classList.add("hidden");state.seconds=60}
}
function showError(message){$("loading").classList.add("hidden");$("notice").textContent=message+" The automatic updater will try again shortly.";$("notice").classList.remove("hidden");$("connectionStatus").className="status error";$("connectionStatus").lastElementChild.textContent="Feed is updating"}
function tick(){state.seconds--;if(state.seconds<=0)load();$("countdown").textContent=state.seconds+"s"}
setupFilters();$("season").addEventListener("change",load);$("week").addEventListener("change",load);$("bookFilter").addEventListener("change",render);$("teamSearch").addEventListener("input",render);$("refreshBtn").addEventListener("click",load);state.timer=setInterval(tick,1000);load();
