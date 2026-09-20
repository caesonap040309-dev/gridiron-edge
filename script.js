const state = { games: [], allGames: [], odds: [], previous: new Map(), seconds: 60, timer: null, league: localStorage.getItem("gridiron-league")==="nfl"?"nfl":"cfb" };
const LEAGUES={
  cfb:{label:"College Football",short:"COLLEGE FOOTBALL",eyebrow:"LAST AVAILABLE LINES",copy:"College-football schedules, model projections, and the most recently available market lines.",data:"data/live.json",weeks:16,summary:"college-football"},
  nfl:{label:"NFL",short:"NFL",eyebrow:"LAST AVAILABLE LINES",copy:"Every NFL game, model projection, final result, and the most recently available market lines.",data:"data/nfl.json",weeks:18,summary:"nfl"}
};
const leagueConfig=()=>LEAGUES[state.league];
const $ = id => document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function safeNewsUrl(value){try{const url=new URL(value);return url.protocol==="https:"?url.href:"#"}catch{return "#"}}

function setupFilters(){
  const now=new Date(); const currentYear=now.getFullYear();
  $("season").innerHTML="";
  for(let y=currentYear-1;y<=currentYear+1;y++) $("season").add(new Option(y,y,y===currentYear,y===currentYear));
  rebuildWeeks();
}
function rebuildWeeks(){
  // Always default to the live-first board when the page or league loads. A
  // specific week remains available only when the visitor deliberately picks it.
  $("week").innerHTML="";
  for(let w=0;w<=leagueConfig().weeks;w++) $("week").add(new Option(w===0?"Live + Upcoming + Final":"Week "+w,w,w===0,w===0));
  $("week").value="0";
}
function applyLeagueUI(){
  const config=leagueConfig(),year=$("season").value||new Date().getFullYear();
  document.querySelectorAll(".league-tab").forEach(button=>{const active=button.dataset.league===state.league;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active))});
  $("brandSubtitle").textContent=config.label+" Market Board";
  $("sideLabel").textContent=config.short+" · "+year;
  $("heroEyebrow").textContent=config.eyebrow;
  $("heroCopy").textContent=config.copy;
  $("boardTitle").textContent=config.label;
  document.title="Gridiron Edge | "+config.label+" Market Board";
  $("teamSearch").placeholder=state.league==="nfl"?"Search Chiefs, Eagles…":"Search Alabama, Michigan…";
}
function switchLeague(league){
  if(!LEAGUES[league]||league===state.league)return;
  state.league=league;localStorage.setItem("gridiron-league",league);state.previous.clear();$("teamSearch").value="";
  rebuildWeeks();applyLeagueUI();load();
}
function fmtTime(value){return new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value))}
function signed(n){if(n==null)return "—";return `${n>0?"+":""}${n}`}
function american(n){if(n==null)return "—";return `${n>0?"+":""}${n}`}
function gameAccent(game){return /^[0-9a-f]{6}$/i.test(game?.homeColor||"")?"#"+game.homeColor:"#3cff8f"}
function hasLiveStatus(game){
  return game?.statusState==="in"||(!game?.statusCompleted&&/quarter|qtr|half|halftime|in progress|end of/i.test(game?.status||""));
}
function isPastGameWindow(game){
  const kickoff=new Date(game?.date).getTime();
  return !game?.statusCompleted&&!/final/i.test(game?.status||"")&&Number.isFinite(kickoff)&&Date.now()-kickoff>8*60*60*1000;
}
function isStaleLive(game){
  return hasLiveStatus(game)&&isPastGameWindow(game);
}
function isLiveGame(game){
  return hasLiveStatus(game)&&!isPastGameWindow(game);
}
function displayGameStatus(game){
  return isPastGameWindow(game)?"Game ended · final score updating":(game?.status||"Scheduled");
}
function liveGameTracker(game){
  if(!isLiveGame(game))return "";
  const situation=game.situation||{};
  const rawYard=Number(situation.yardLine);
  const ballPosition=Number.isFinite(rawYard)?Math.min(96,Math.max(4,rawYard)):50;
  const possession=String(situation.possession||"");
  const possessionTeam=possession&&possession===String(game.homeId||"")?game.home:possession&&possession===String(game.awayId||"")?game.away:null;
  const awayScore=Number.isFinite(Number(game.awayScore))?Number(game.awayScore):0;
  const homeScore=Number.isFinite(Number(game.homeScore))?Number(game.homeScore):0;
  const down=situation.downDistanceText||situation.possessionText||"Live game in progress";
  return `<div class="live-game-tracker" aria-label="Live game feed"><div class="live-tracker-head"><span><i></i> LIVE · ${esc(game.status||"In progress")}</span><strong>${esc(game.away)} ${awayScore}–${homeScore} ${esc(game.home)}</strong></div><div class="mini-field"><span class="endzone left"></span><span class="yard y20"></span><span class="yard y40"></span><span class="yard y60"></span><span class="yard y80"></span><b class="football" style="left:${ballPosition}%" title="Approximate ball position">◆</b></div><div class="live-situation"><b>${possessionTeam?`${esc(possessionTeam)} ball · `:""}${esc(down)}</b>${situation.lastPlay?`<small>${esc(situation.lastPlay)}</small>`:"<small>Waiting for the latest play…</small>"}</div></div>`;
}
function gradeSpread(game,p){const m=p?.market;if(isPastGameWindow(game))return "";if(!m||!(/final/i.test(game.status||""))||m.homePoint==null)return m?"PENDING":"";const adjusted=Number(game.homeScore)+Number(m.homePoint)-Number(game.awayScore);if(adjusted===0)return"PUSH";const homeCovered=adjusted>0;return((m.spreadPick===game.home)===homeCovered)?"COVERED":"MISSED"}
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
function modelRecords(){
  const result={outright:{wins:0,losses:0,pushes:0},spread:{wins:0,losses:0,pushes:0},total:{wins:0,losses:0,pushes:0}};
  for(const game of (state.seasonGames||state.allGames)){
    if(!/final/i.test(game.status||""))continue;
    const p=game.prediction||{},market=p.market;
    if(!p.createdAt||new Date(p.createdAt)>=new Date(game.date))continue;
    const home=Number(game.homeScore),away=Number(game.awayScore);
    if(!Number.isFinite(home)||!Number.isFinite(away))continue;
    if(home!==away&&p.winner){
      const actual=home>away?game.home:game.away;
      result.outright[p.winner===actual?"wins":"losses"]++;
    }
    if(market?.spreadPick&&market.homePoint!=null){
      const adjusted=home+Number(market.homePoint)-away;
      if(adjusted===0)result.spread.pushes++;
      else{
        const homeCovered=adjusted>0;
        result.spread[(market.spreadPick===game.home)===homeCovered?"wins":"losses"]++;
      }
    }
    if(market?.totalPick&&market.total!=null){
      const actualTotal=home+away,posted=Number(market.total);
      if(actualTotal===posted)result.total.pushes++;
      else result.total[(market.totalPick==="Over")===(actualTotal>posted)?"wins":"losses"]++;
    }
  }
  return result;
}
function renderModelRecords(){
  const records=modelRecords();
  const put=(key,prefix)=>{
    const r=records[key],decisions=r.wins+r.losses,total=decisions+r.pushes;
    $(prefix+"Record").textContent=`${r.wins}–${r.losses}${r.pushes?"–"+r.pushes+"P":""}`;
    $(prefix+"Pct").textContent=decisions?`${(r.wins/decisions*100).toFixed(1)}%`:"—";
    $(prefix+"Sample").textContent=`${total} graded pick${total===1?"":"s"}`;
  };
  put("outright","outright");put("spread","spread");put("total","total");
  $("performanceNote").textContent=`${leagueConfig().label} · ${$("season").value} season · All weeks combined · Only saved pregame predictions are graded`;
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
    const p=g.prediction||{},cardGrade=gradeSpread(g,p);
    const prediction=p.winner?`<div class="model-strip"><div><span>Gridiron Edge prediction</span><strong>${esc(p.winner)} · ${esc(g.away)} ${Number(p.awayScore)||0}–${esc(g.home)} ${Number(p.homeScore)||0}</strong></div><div><span>Model spread</span><strong>${esc(g.home)} ${signed(p.spread)}</strong></div><div><span>Model total</span><strong>${Number(p.total).toFixed(1)}</strong></div><div><span>Home win chance</span><strong>${Number(p.homeWin).toFixed(1)}%</strong></div><div class="probability"><span>Away ${Math.max(0,100-Number(p.homeWin)).toFixed(1)}%</span><i><b style="width:${Number(p.homeWin).toFixed(1)}%"></b></i><span>Home ${Number(p.homeWin).toFixed(1)}%</span></div><small>Based on season scoring and defensive results · ${Number(p.sample)||0} shared-game sample</small></div>`:"";
    const isFinal=/final/i.test(g.status||"");
    const wasPregame=p.createdAt&&new Date(p.createdAt)<new Date(g.date);
    const final=isFinal?`<div class="final-strip"><div><span>Actual final score</span><strong>${esc(g.away)} ${Number(g.awayScore)}–${esc(g.home)} ${Number(g.homeScore)}</strong></div><div><span>${wasPregame?"Pregame prediction":"Prediction comparison"}</span><strong>${wasPregame?`${esc(g.away)} ${Number(p.awayScore)}–${esc(g.home)} ${Number(p.homeScore)}`:"Available for games predicted before kickoff"}</strong></div></div>`:"";
    return `<article class="game" style="--team-color:${gameAccent(g)}" role="button" tabindex="0" data-game-id="${esc(g.id)}" aria-label="Open ${esc(g.away)} at ${esc(g.home)} details"><div class="matchup"><div class="card-top"><span class="kickoff">${esc(fmtTime(g.date))} · ${esc(displayGameStatus(g))}</span>${cardGrade?`<span class="result-badge ${cardGrade.toLowerCase()}">${cardGrade}</span>`:""}</div><div class="teams"><div class="team">${logo(g.awayLogo,g.away)}<span>${esc(g.away)}</span><small>${isFinal?esc(g.awayScore):awaySpread?signed(awaySpread.point):""}</small></div><div class="team">${logo(g.homeLogo,g.home)}<span>${esc(g.home)}</span><small>${isFinal?esc(g.homeScore):homeSpread?signed(homeSpread.point):""}</small></div></div></div>${liveGameTracker(g)}<div class="market"><span>Spread</span><strong>${homeSpread?`${esc(g.home)} ${signed(homeSpread.point)} (${american(homeSpread.price)})`:"—"}</strong><small>${homeSpread?esc(homeSpread.book):"Line unavailable"}${awaySpread?` · ${esc(g.away)} ${signed(awaySpread.point)} (${american(awaySpread.price)}) · ${esc(awaySpread.book)}`:""}</small></div><div class="market"><span>Total</span><strong>${over?`Over ${Number(over.point)} (${american(over.price)})`:"—"}</strong><small>${over?esc(over.book):"Line unavailable"}${under?` · Under ${Number(under.point)} (${american(under.price)}) · ${esc(under.book)}`:""}</small></div><div class="market"><span>Moneyline</span><strong>${awayMl?`${esc(g.away)} ${american(awayMl.price)} / ${esc(g.home)} ${american(homeMl?.price)}`:"—"}</strong><small>${awayMl?esc(awayMl.book):"Line unavailable"}${homeMl?` / ${esc(homeMl.book)}`:""}</small></div><div class="movement"><span>Since last refresh</span><strong class="${move.cls}">${esc(move.text)}</strong><small class="pill">60 sec</small></div>${prediction}${final}</article>`;
  }).join("");
  $("gameCount").textContent=list.length; $("oddsCount").textContent=withOdds; $("moveCount").textContent=moves;
  $("empty").classList.toggle("hidden",list.length>0);
}
function populateBooks(){
  const current=$("bookFilter").value; const books=new Map(); state.odds.forEach(e=>(e.bookmakers||[]).forEach(b=>books.set(b.key,b.title)));
  $("bookFilter").innerHTML='<option value="all">Best available</option>'+[...books].sort((a,b)=>a[1].localeCompare(b[1])).map(([k,v])=>`<option value="${k}">${v}</option>`).join("");
  if(books.has(current))$("bookFilter").value=current;
}
async function refreshLiveGames(year,week){
  const params=new URLSearchParams({limit:"1000",seasontype:"2"});
  if(String(week)!=="0"){
    params.set("dates",String(year));
    params.set("week",String(week));
  }else{
    const ymd=date=>date.toISOString().slice(0,10).replace(/-/g,"");
    const now=new Date(),start=new Date(now),end=new Date(now);
    start.setUTCDate(start.getUTCDate()-7);
    end.setUTCDate(end.getUTCDate()+1);
    params.set("dates",ymd(start)+"-"+ymd(end));
  }
  try{
    const url=`https://site.api.espn.com/apis/site/v2/sports/football/${leagueConfig().summary}/scoreboard?${params}`;
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)return;
    const scoreboard=await response.json();
    const updates=new Map();
    for(const event of scoreboard.events||[]){
      const competition=event.competitions?.[0]||{};
      const home=competition.competitors?.find(team=>team.homeAway==="home");
      const away=competition.competitors?.find(team=>team.homeAway==="away");
      updates.set(String(event.id),{
        status:event.status?.type?.shortDetail||"Scheduled",
        statusState:event.status?.type?.state||null,
        statusCompleted:event.status?.type?.completed===true,
        homeScore:home?.score,awayScore:away?.score,
        homeId:String(home?.team?.id||""),awayId:String(away?.team?.id||""),
        situation:competition.situation?{
          possession:String(competition.situation.possession||""),
          downDistanceText:competition.situation.downDistanceText||null,
          possessionText:competition.situation.possessionText||null,
          yardLine:Number.isFinite(Number(competition.situation.yardLine))?Number(competition.situation.yardLine):null,
          lastPlay:competition.situation.lastPlay?.text||null
        }:null
      });
    }
    const apply=game=>Object.assign(game,updates.get(String(game.id))||{});
    state.seasonGames?.forEach(apply);state.allGames.forEach(apply);state.games.forEach(apply);
  }catch{}
}
async function load(){
  $("loading").classList.remove("hidden"); $("notice").classList.add("hidden");
  try{
    const year=$("season").value,week=$("week").value;
    const response=await fetch(`${leagueConfig().data}?t=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error("The live feed has not been generated yet.");
    const live=await response.json();
    state.odds=live.events||[]; state.seasonGames=(live.games||[]).filter(g=>String(g.season)===String(year)); state.allGames=state.seasonGames.map(game=>({...game})); $("dataCredit").textContent=`${leagueConfig().label} schedules and scores · Odds: ${live.oddsSource||"available sportsbook markets"}`;
    state.games=(live.games||[]).filter(g=>String(g.season)===String(year)&&(week==="0"?true:String(g.week)===String(week))).sort((a,b)=>new Date(a.date)-new Date(b.date));
    await refreshLiveGames(year,week);
    state.games.sort((a,b)=>{const rank=g=>isLiveGame(g)?0:(g.statusCompleted||/final/i.test(g.status||"")||isPastGameWindow(g))?2:1;return rank(a)-rank(b)||new Date(a.date)-new Date(b.date)});
    populateBooks();render();renderModelRecords();$("lastUpdated").textContent=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    $("connectionStatus").className="status live";$("connectionStatus").lastElementChild.textContent="Latest data loaded";
    if(live.updatedAt) $("lastUpdated").textContent=new Date(live.updatedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  }catch(e){showError(e.message+" Check the API setup and try again.")}
  finally{$("loading").classList.add("hidden");state.seconds=60}
}
function showError(message){$("loading").classList.add("hidden");$("notice").textContent=message+" The automatic updater will try again shortly.";$("notice").classList.remove("hidden");$("connectionStatus").className="status error";$("connectionStatus").lastElementChild.textContent="Feed is updating"}
function tick(){state.seconds--;if(state.seconds<=0)load();$("countdown").textContent=state.seconds+"s"}
const FEATURED_SPORTSBOOKS=[
  {name:"FanDuel",keys:["fanduel"]},{name:"DraftKings",keys:["draftkings"]},
  {name:"BetMGM",keys:["betmgm"]},{name:"Caesars",keys:["williamhill_us","caesars"]},
  {name:"ESPN BET",keys:["espnbet","espn_bet","espn"]},
  {name:"Hard Rock",keys:["hardrockbet","hardrockbet_fl","hardrockbet_oh","hard_rock_bet"]},
  {name:"BetRivers",keys:["betrivers"]},{name:"bet365",keys:["bet365"]},
  {name:"Fanatics",keys:["fanatics"]},{name:"Bally Bet",keys:["ballybet","bally_bet"]}
];
function sportsbookKey(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function orderedSportsbooks(event){
  const available=[...(event?.bookmakers||[])],used=new Set();
  const featured=FEATURED_SPORTSBOOKS.map(feature=>{
    const aliases=new Set([sportsbookKey(feature.name),...feature.keys.map(sportsbookKey)]);
    const index=available.findIndex((book,i)=>!used.has(i)&&(aliases.has(sportsbookKey(book.key))||aliases.has(sportsbookKey(book.title))));
    if(index<0)return {key:feature.keys[0],title:feature.name,markets:[],unavailable:true};
    used.add(index);return {...available[index],title:feature.name};
  });
  return [...featured,...available.filter((book,index)=>!used.has(index)).sort((a,b)=>String(a.title||a.key).localeCompare(String(b.title||b.key)))];
}
function bestOfferKeys(event){
  const offers=[];
  for(const book of event?.bookmakers||[])for(const market of book.markets||[])for(const outcome of market.outcomes||[])offers.push({book:book.key,market:market.key,...outcome});
  const winners=new Set(),names=[...new Set(offers.map(o=>`${o.market}|${o.name}`))];
  for(const group of names){
    const [market,name]=group.split("|");
    const candidates=offers.filter(o=>o.market===market&&o.name===name&&Number.isFinite(Number(o.price)));
    candidates.sort((a,b)=>{
      if(market==="spreads")return (Number(b.point)-Number(a.point))||(Number(b.price)-Number(a.price));
      if(market==="totals")return (name==="Over"?Number(a.point)-Number(b.point):Number(b.point)-Number(a.point))||(Number(b.price)-Number(a.price));
      return Number(b.price)-Number(a.price);
    });
    if(candidates[0])winners.add(`${candidates[0].book}|${market}|${name}`);
  }
  return winners;
}
function allBookRows(event){
  const best=bestOfferKeys(event);
  return orderedSportsbooks(event).map(book=>{
    const markets=Object.fromEntries((book.markets||[]).map(m=>[m.key,m.outcomes||[]]));
    const render=(market,outcomes,format)=>(outcomes||[]).map(o=>{const top=best.has(`${book.key}|${market}|${o.name}`);return `<span class="line-offer${top?" best-line":""}">${format(o)}${top?'<b>BEST</b>':""}</span>`}).join("")||"—";
    const spread=render("spreads",markets.spreads,o=>`${esc(o.name)} ${signed(o.point)} (${american(o.price)})`);
    const total=render("totals",markets.totals,o=>`${esc(o.name)} ${o.point} (${american(o.price)})`);
    const moneyline=render("h2h",markets.h2h,o=>`${esc(o.name)} ${american(o.price)}`);
    const status=book.unavailable?'<small class="book-status">Line unavailable</small>':"";
    return `<tr class="${book.unavailable?"book-unavailable":""}"><th>${esc(book.title||book.key)}${status}</th><td>${spread}</td><td>${total}</td><td>${moneyline}</td></tr>`;
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
function clamp(value,min=0,max=100){return Math.min(max,Math.max(min,Number(value)||0))}
function modelIndex(value,type){return Math.round(clamp(type==="defense"?50+(27-Number(value))*2:50+(Number(value)-27)*2))}
function strengthRanks(){
  const teams=new Map();
  state.games.forEach(game=>{const p=game.prediction||{};if(p.awayOffense!=null)teams.set(game.away,{score:Number(p.awayOffense)-Number(p.awayDefense)});if(p.homeOffense!=null)teams.set(game.home,{score:Number(p.homeOffense)-Number(p.homeDefense)})});
  return [...teams].sort((a,b)=>b[1].score-a[1].score).map(([name],index)=>[name,index+1]);
}
function ratingBar(label,left,right,leftName,rightName){
  const leftWidth=clamp(left),rightWidth=clamp(right);
  return `<div class="rating-row"><div class="rating-label"><b>${esc(leftName)} ${leftWidth}</b><span>${esc(label)}</span><b>${rightWidth} ${esc(rightName)}</b></div><div class="dual-bars"><i><b style="width:${leftWidth}%"></b></i><i><b style="width:${rightWidth}%"></b></i></div></div>`;
}
function espnTeamStats(summary,awayName,homeName){
  const teams=summary?.boxscore?.teams||[];if(teams.length<2)return "";
  const find=name=>teams.find(x=>(x.team?.displayName||"").toLowerCase()===name.toLowerCase());
  const away=find(awayName)||teams[0],home=find(homeName)||teams[1];
  const amap=new Map((away.statistics||[]).map(x=>[x.name||x.label,x.displayValue??x.value]));
  const hmap=new Map((home.statistics||[]).map(x=>[x.name||x.label,x.displayValue??x.value]));
  const labels=new Map([...(away.statistics||[]),...(home.statistics||[])].map(x=>[x.name||x.label,x.label||x.name]));
  if(!labels.size)return "";
  return `<section class="detail-section"><div class="section-title"><span class="eyebrow">OFFICIAL GAME DATA</span><h3>Team statistics</h3></div><div class="comparison"><div class="comparison-head"><b>${esc(awayName)}</b><span>Statistic</span><b>${esc(homeName)}</b></div>${[...labels].slice(0,18).map(([key,label])=>`<div><strong>${esc(amap.get(key)??"—")}</strong><span>${esc(label)}</span><strong>${esc(hmap.get(key)??"—")}</strong></div>`).join("")}</div></section>`;
}
function pickResults(game,p){
  const market=p?.market;if(!market)return '<div class="detail-empty compact">A pregame market snapshot has not been saved for this game.</div>';
  const isFinal=/final/i.test(game.status||""),home=Number(game.homeScore),away=Number(game.awayScore),total=home+away;
  let spreadStatus="PENDING",totalStatus="PENDING";
  if(isFinal&&Number.isFinite(home)&&Number.isFinite(away)&&market.homePoint!=null){
    const adjusted=home+Number(market.homePoint)-away;
    const homeCovered=adjusted>0, push=adjusted===0;
    spreadStatus=push?"PUSH":((market.spreadPick===game.home)===homeCovered?"COVERED":"MISSED");
  }
  if(isFinal&&Number.isFinite(total)&&market.total!=null)totalStatus=total===Number(market.total)?"PUSH":((market.totalPick==="Over")===(total>Number(market.total))?"COVERED":"MISSED");
  const badge=status=>`<span class="result-badge ${status.toLowerCase()}">${status}</span>`;
  return `<div class="pick-result"><h4>${esc(market.spreadPick||"Spread unavailable")} ${market.homePoint!=null?"vs "+esc(game.home)+" "+signed(market.homePoint):""}</h4><p>Model line ${signed(p.spread)} · Market captured at ${esc(market.spreadBook||"sportsbook")}</p>${badge(spreadStatus)}</div><div class="pick-result"><h4>${esc(market.totalPick||"Total unavailable")} ${market.total!=null?market.total:""}</h4><p>Model total ${Number(p.total).toFixed(1)} · ${esc(market.totalBook||"sportsbook")}</p>${badge(totalStatus)}</div>`;
}
function injuryReport(game,p){
  const groups=[["away",game.away],["home",game.home]];
  const cards=groups.flatMap(([side,team])=>(game.injuries?.[side]||[]).sort((a,b)=>(Number(b.expectedLoss)||0)-(Number(a.expectedLoss)||0)).map(item=>`<div><span>${esc(team)} · ${esc(item.position||"—")} · ${esc(item.status||"Unknown")}</span><b>${esc(item.name)}</b><strong>${Math.round(Number(item.availability)||0)}% available</strong></div>`));
  const impact=p?.injuryImpact;
  const summary=impact?`<p class="method-note">Expected roster loss: ${esc(game.away)} ${Number(impact.awayLoss||0).toFixed(1)} pts · ${esc(game.home)} ${Number(impact.homeLoss||0).toFixed(1)} pts. Net margin adjustment: ${signed(p.adjustments?.injuryMargin||0)} points toward the home team. Questionable-player uncertainty can lower confidence.</p>`:"";
  return cards.length?`<div class="keys-grid">${cards.join("")}</div>${summary}`:`<div class="detail-empty">No reportable injuries were returned for this matchup. The model will recheck on every data update.</div>${summary}`;
}
function sharpMetrics(game,p){
  if(!p||!p.version)return "";
  const coverSide=p.homeCover==null?"—":p.homeCover>=50?game.home:game.away;
  const coverProb=p.homeCover==null?null:Math.max(Number(p.homeCover),Number(p.awayCover));
  const totalSide=p.overProb==null?"—":p.overProb>=50?"Over":"Under";
  const totalProb=p.overProb==null?null:Math.max(Number(p.overProb),Number(p.underProb));
  const homeWin=Number(p.homeWin),winnerProb=Number.isFinite(homeWin)&&p.winner?(p.winner===game.home?homeWin:100-homeWin):null;
  const winnerConfidence=winnerProb==null?"Unrated":winnerProb>=60?"High":winnerProb>=55?"Medium":"Low";
  const spreadEdge=Math.abs(Number(p.spreadEdge)||0),totalEdge=Math.abs(Number(p.totalEdge)||0),books=Number(p.marketBooks)||0;
  const spreadProb=coverProb==null?0:Number(coverProb),totalP=totalProb==null?0:Number(totalProb);
  const units=(edge,prob)=>books<2||edge<2||prob<54?0:(books>=3&&edge>=4.5&&prob>=61?3:(edge>=3&&prob>=57?2:1));
  const spreadUnits=units(spreadEdge,spreadProb),totalUnits=units(totalEdge,totalP);
  const unitText=n=>n===3?"3 Units · Strongest":n===2?"2 Units · Strong":n===1?"1 Unit · Lean":"NO BET · Pass";
  return `<div class="sharp-metrics"><div><span>Spread bet rating</span><b>${unitText(spreadUnits)}</b><small>${spreadUnits?"Qualified model edge":"Edge/data quality below threshold"}</small></div><div><span>Total bet rating</span><b>${unitText(totalUnits)}</b><small>${totalUnits?"Qualified model edge":"Edge/data quality below threshold"}</small></div><div><span>Spread edge</span><b>${p.spreadEdge==null?"—":signed(p.spreadEdge)+" pts"}</b><small>${coverProb==null?"Waiting for market":esc(coverSide)+" "+coverProb.toFixed(1)+"%"}</small></div><div><span>Total edge</span><b>${p.totalEdge==null?"—":signed(p.totalEdge)+" pts"}</b><small>${totalProb==null?"Waiting for market":totalSide+" "+totalProb.toFixed(1)+"%"}</small></div><div><span>Fair moneyline</span><b>${esc(game.home)} ${american(p.fairHomeMoneyline)}</b><small>${esc(game.away)} ${american(p.fairAwayMoneyline)}</small></div><div><span>Model confidence</span><b>${winnerConfidence}</b><small>${winnerProb==null?"Win probability unavailable":esc(p.winner)+" "+winnerProb.toFixed(1)+"%"} · ${Number(p.sample)||0} games · ${Number(p.marketBooks)||0} books</small></div></div>${p.adjustments?`<div class="model-factors"><span>Model v${Number(p.version)||"—"}</span><span>${p.adjustments.neutralSite?"Neutral site":"Home field "+signed(p.adjustments.homeField)}</span><span>Rest ${signed(p.adjustments.rest)}</span><span>Venue form ${signed(p.adjustments.venue)}</span><span>Weather total ${signed(p.adjustments.weatherTotal)}</span><span>Injuries ${signed(p.adjustments.injuryMargin||0)} margin</span></div>`:""}`;
}
function scoringSummary(summary){
  const plays=summary?.scoringPlays||[];
  if(!plays.length)return '<div class="detail-empty">Scoring plays will appear here once the game begins.</div>';
  return '<div class="scoring-list">'+plays.map(play=>`<div><span>${esc(play.period?.displayValue||("Q"+(play.period?.number||"")))} · ${esc(play.clock?.displayValue||"")}</span><b>${esc(play.team?.displayName||"Scoring play")}</b><p>${esc(play.text||play.type?.text||"Score")}</p><strong>${esc(play.awayScore??"")}–${esc(play.homeScore??"")}</strong></div>`).join("")+'</div>';
}
async function openGame(id){
  const game=state.games.find(item=>String(item.id)===String(id));if(!game)return;
  const event=oddsEventFor(game),p=game.prediction||{},homeWin=Number(p.homeWin)||50,awayWin=100-homeWin;
  const dialog=$("gameDialog");const color=/^[0-9a-f]{6}$/i.test(game.homeColor||"")?"#"+game.homeColor:"#0879e6";const alt=/^[0-9a-f]{6}$/i.test(game.homeAltColor||"")?"#"+game.homeAltColor:color;const brightness=hex=>{const v=hex.replace("#","");return(299*parseInt(v.slice(0,2),16)+587*parseInt(v.slice(2,4),16)+114*parseInt(v.slice(4,6),16))/1000};const darkMode=document.body.classList.contains("theme-dark");const candidates=[color,alt];const readable=darkMode?(candidates.sort((a,b)=>brightness(b)-brightness(a))[0]):(candidates.sort((a,b)=>brightness(a)-brightness(b))[0]);dialog.style.setProperty("--team-color",color);dialog.style.setProperty("--team-alt",alt);dialog.style.setProperty("--team-ink",readable);location.hash=`game-${game.id}`;
  $("detailBody").innerHTML=`<div class="detail-loading"><span class="eyebrow">MATCHUP ROOM</span><h2>${esc(game.away)} at ${esc(game.home)}</h2><p>Loading game statistics…</p></div>`;
  dialog.showModal();
  let summary=null;
  try{const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${leagueConfig().summary}/summary?event=${encodeURIComponent(game.id)}`);if(response.ok)summary=await response.json()}catch{}
  const liveCompetition=summary?.header?.competitions?.[0]||null;
  const liveStatus=liveCompetition?.status?.type||{};
  const detailStatus=liveStatus.shortDetail||liveStatus.detail||game.status||"Scheduled";
  const summaryCompetitors=liveCompetition?.competitors||[];
  const competitorScore=side=>{
    const competitor=summaryCompetitors.find(item=>item.homeAway===side);
    const value=competitor?.score?.displayValue??competitor?.score;
    return value==null||value===""?null:Number(value);
  };
  const summaryAwayScore=competitorScore("away"),summaryHomeScore=competitorScore("home");
  const feedAwayScore=Number(game.awayScore),feedHomeScore=Number(game.homeScore);
  const actualAwayScore=Number.isFinite(summaryAwayScore)?summaryAwayScore:(Number.isFinite(feedAwayScore)?feedAwayScore:null);
  const actualHomeScore=Number.isFinite(summaryHomeScore)?summaryHomeScore:(Number.isFinite(feedHomeScore)?feedHomeScore:null);
  const detailIsFinal=liveStatus.completed===true||/final/i.test(detailStatus);
  const detailIsLive=!isPastGameWindow(game)&&(liveStatus.state==="in"||(!detailIsFinal&&/quarter|qtr|half|halftime|in progress|end of/i.test(detailStatus)));
  const showActualScore=(detailIsLive||detailIsFinal)&&actualAwayScore!=null&&actualHomeScore!=null;
  const scoreLabel=detailIsFinal?"FINAL SCORE":detailIsLive?"LIVE SCORE":"MODEL PREDICTION";
  const topAwayScore=showActualScore?actualAwayScore:(Number(p.awayScore)||0);
  const topHomeScore=showActualScore?actualHomeScore:(Number(p.homeScore)||0);
  const predictionComparison=showActualScore?`<div class="prediction-comparison"><span>GRIDIRON EDGE PREGAME PREDICTION</span><strong>${esc(game.away)} ${Number(p.awayScore)||0}–${esc(game.home)} ${Number(p.homeScore)||0}</strong><small>Locked before kickoff for an honest comparison</small></div>`:"";
  const ranks=new Map(strengthRanks());
  const awayOff=modelIndex(p.awayOffense,"offense"),homeOff=modelIndex(p.homeOffense,"offense"),awayDef=modelIndex(p.awayDefense,"defense"),homeDef=modelIndex(p.homeDefense,"defense");
  const awayCover=awayDef,homeCover=homeDef;
  const metrics=[
    ["Strength rank",ranks.get(game.away)?"#"+ranks.get(game.away):"—",ranks.get(game.home)?"#"+ranks.get(game.home):"—"],
    ["Avg points scored",p.awayOffense,p.homeOffense],["Avg points allowed",p.awayDefense,p.homeDefense],
    ["Offense index",awayOff,homeOff],["Defense index",awayDef,homeDef],["Coverage proxy",awayCover,homeCover],
    ["Projected points",p.awayScore,p.homeScore],["Win probability",awayWin.toFixed(1)+"%",homeWin.toFixed(1)+"%"],["Historical games used",p.history?.awayGames??"—",p.history?.homeGames??"—"]
  ];
  const awayEdge=Math.round((awayOff-homeDef)*10)/10,homeEdge=Math.round((homeOff-awayDef)*10)/10;
  const keys=[
    {team:awayEdge>=0?game.away:game.home,text:`${game.away} offense vs. ${game.home} defensive scoring index`,edge:awayEdge},
    {team:homeEdge>=0?game.home:game.away,text:`${game.home} offense vs. ${game.away} defensive scoring index`,edge:homeEdge},
    {team:homeWin>=50?game.home:game.away,text:"Overall projection advantage",edge:Math.abs(homeWin-50)}
  ];
  $("detailBody").innerHTML=`
    <header class="detail-head"><a class="back-link" href="#" id="detailBack">← All games</a><span class="eyebrow">THE MATCHUP ROOM</span><h2>${esc(game.away)} at ${esc(game.home)}</h2><p>${esc(fmtTime(game.date))} · ${esc(game.status||"Scheduled")}</p></header><nav class="detail-tabs"><a href="#model-pick">Model pick</a><a href="#win-probability">Win probability</a><a href="#injuries">Injuries</a><a href="#scoring">Scoring</a><a href="#team-stats">Team stats</a><a href="#box-score">Box score</a></nav>
    <section class="score-projection ${showActualScore?"showing-actual":"showing-prediction"}" id="model-pick"><div class="score-state-label ${detailIsLive?"live":detailIsFinal?"final":""}">${esc(scoreLabel)}${detailIsLive?` · ${esc(detailStatus)}`:""}</div><div>${logo(game.awayLogo,game.away)}<h3>${esc(game.away)}</h3><small>Rank ${ranks.get(game.away)?"#"+ranks.get(game.away):"—"} · Away</small><strong>${topAwayScore}</strong></div><span>VS</span><div>${logo(game.homeLogo,game.home)}<h3>${esc(game.home)}</h3><small>Rank ${ranks.get(game.home)?"#"+ranks.get(game.home):"—"} · Home</small><strong>${topHomeScore}</strong></div><div class="projection-summary"><div><span>Model spread</span><b>${esc(game.home)} ${signed(p.spread)}</b></div><div><span>Projected total</span><b>${Number(p.total).toFixed(1)}</b></div><div><span>Win outlook</span><b>${esc(p.winner||"Toss-up")}</b></div></div>${predictionComparison}<div class="detail-prob-labels"><b>${awayWin.toFixed(1)}%</b><span>WIN PROBABILITY</span><b>${homeWin.toFixed(1)}%</b></div><div class="detail-probability"><i style="width:${awayWin}%"></i><i style="width:${homeWin}%"></i></div></section>
    <section class="detail-section model-pick-card"><div class="section-title"><span class="eyebrow">OUR PICK · VS THE MARKET</span><h3>Model picks and results</h3></div><div class="pick-results">${pickResults(game,p)}</div>${sharpMetrics(game,p)}<div class="section-subtitle">Matchup advantages</div><div class="keys-grid">${keys.map(key=>`<div><span>${esc(key.text)}</span><b>${esc(key.team)}</b><strong>${key.edge>=0?"+":""}${key.edge.toFixed(1)}</strong></div>`).join("")}</div></section>
    <section class="detail-section" id="injuries"><div class="section-title"><span class="eyebrow">INJURY-WEIGHTED OUTLOOK</span><h3>Availability and model impact</h3><p>Position value, listed game status, expected availability, and uncertainty are applied before the prediction is ranked.</p></div>${injuryReport(game,p)}</section>\n    <section class="detail-section" id="win-probability"><div class="section-title"><span class="eyebrow">WIN PROBABILITY · TALE OF THE TAPE</span><h3>Head-to-head numbers</h3></div><div class="comparison"><div class="comparison-head"><b>${esc(game.away)}</b><span>Metric</span><b>${esc(game.home)}</b></div>${metrics.map(row=>`<div><strong>${esc(row[1]??"—")}</strong><span>${esc(row[0])}</span><strong>${esc(row[2]??"—")}</strong></div>`).join("")}</div><div class="ratings">${ratingBar("Offense",awayOff,homeOff,game.away,game.home)}${ratingBar("Defense",awayDef,homeDef,game.away,game.home)}${ratingBar("Coverage proxy",awayCover,homeCover,game.away,game.home)}</div><p class="method-note">The model uses the current season plus two prior seasons, discounts older games, adjusts every result for opponent strength, and accounts for venue form, rest, neutral sites, injury-weighted player availability, weather when published, multi-book market consensus, and sportsbook disagreement. High confidence requires both a meaningful edge and enough independent evidence. Coverage proxy is not an official player-tracking grade.</p></section>
    <section class="detail-section" id="team-stats"><div class="section-title"><span class="eyebrow">SPORTSBOOK REFERENCE</span><h3>Last Available Lines</h3><p>These are the most recently available lines supplied for this matchup and may not reflect the current market.</p></div><div class="table-scroll"><table class="odds-table"><thead><tr><th>Sportsbook</th><th>Spread</th><th>Total</th><th>Moneyline</th></tr></thead><tbody>${allBookRows(event)}</tbody></table></div></section>
    <section class="detail-section" id="scoring"><div class="section-title"><span class="eyebrow">GAME FLOW</span><h3>Scoring summary</h3></div>${scoringSummary(summary)}</section>
    ${espnTeamStats(summary,game.away,game.home)}
    <section class="detail-section" id="box-score"><div class="section-title"><span class="eyebrow">ESPN BOX SCORE</span><h3>Player statistics</h3></div>${playerTables(summary)}</section>`;
  $("detailBack")?.addEventListener("click",event=>{event.preventDefault();dialog.close();history.replaceState(null,"",location.pathname+location.search)});
}
$("games").addEventListener("click",event=>{const card=event.target.closest(".game");if(card)openGame(card.dataset.gameId)});
$("games").addEventListener("keydown",event=>{if((event.key==="Enter"||event.key===" ")&&event.target.matches(".game")){event.preventDefault();openGame(event.target.dataset.gameId)}});
$("closeDialog").addEventListener("click",()=>$("gameDialog").close());
$("gameDialog").addEventListener("click",event=>{if(event.target===$("gameDialog"))$("gameDialog").close()});

const savedTheme=localStorage.getItem("gridiron-theme")||"light";
document.body.classList.toggle("theme-light",savedTheme==="light");
document.body.classList.toggle("theme-dark",savedTheme==="dark");
function updateThemeButton(){const light=document.body.classList.contains("theme-light");$("themeToggle").textContent=light?"☾ Dark mode":"☀ Light mode"}
$("themeToggle").addEventListener("click",()=>{const light=!document.body.classList.contains("theme-light");document.body.classList.toggle("theme-light",light);document.body.classList.toggle("theme-dark",!light);localStorage.setItem("gridiron-theme",light?"light":"dark");updateThemeButton()});updateThemeButton();

setupFilters();applyLeagueUI();
document.querySelectorAll(".league-tab").forEach(button=>button.addEventListener("click",()=>switchLeague(button.dataset.league)));
$("season").addEventListener("change",()=>{applyLeagueUI();load()});$("week").addEventListener("change",load);$("bookFilter").addEventListener("change",render);$("teamSearch").addEventListener("input",render);$("refreshBtn").addEventListener("click",load);state.timer=setInterval(tick,1000);load();
