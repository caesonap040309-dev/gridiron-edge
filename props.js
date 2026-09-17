(()=>{
  const cache={nfl:null,cfb:null};
  let currentCategory="Top Props";
  let selectedPropWeek="all";
  let playerSearch="";
  let selectedLeague=(localStorage.getItem("gridiron-league")==="nfl"?"nfl":"cfb");
  const esc=value=>String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const pct=value=>Number.isFinite(Number(value))?`${Number(value).toFixed(1)}%`:"—";
  const price=value=>{const n=Number(value);return Number.isFinite(n)?(n>0?`+${n}`:`${n}`):""};
  const dataUrl=key=>key==="nfl"?"data/props-nfl.json":"data/props-cfb.json";
  const initials=name=>String(name||"").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase();

  function installStyles(){
    if(document.getElementById("gridiron-prop-polish"))return;
    const style=document.createElement("style");
    style.id="gridiron-prop-polish";
    style.textContent=`
      #propCards{display:grid;gap:14px}
      .prop-search-control{display:grid;gap:6px;margin:0 0 14px;color:#64748b;font-size:.78rem;font-weight:800}.prop-search-control input{width:100%;padding:12px 14px;border:1px solid #d8e0ea;border-radius:12px;background:#fff;color:#0f172a;font:inherit;outline:none}.prop-search-control input:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
      .player-prop-card{border:1px solid #d8e0ea;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.06)}
      .player-prop-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border:0;background:transparent;text-align:left;cursor:pointer;color:#0f172a}
      .player-prop-toggle:hover{background:#f8fafc}.player-prop-left{display:flex;align-items:center;gap:13px;min-width:0}.player-prop-copy{min-width:0}.player-prop-copy h3{margin:1px 0 3px;font-size:1.05rem}.player-prop-copy p{margin:0;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.player-prop-copy small{color:#94a3b8;font-weight:700}
      .prop-headshot,.prop-avatar-fallback{width:54px;height:54px;border-radius:14px;flex:0 0 54px;background:#e8edf4;border:1px solid #d7dee8}.prop-headshot{object-fit:cover;object-position:center top}.prop-avatar-fallback{display:grid;place-items:center;color:#334155;font-weight:900}
      .player-prop-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.prop-count-pill{padding:6px 9px;border-radius:999px;background:#eef3f9;color:#334155;font-size:.75rem;font-weight:800}.prop-chevron{font-size:1.05rem;color:#64748b;transition:transform .18s ease}.player-prop-card.open .prop-chevron{transform:rotate(180deg)}
      .player-prop-body{display:none;border-top:1px solid #e5eaf0;background:#f8fafc;padding:12px}.player-prop-card.open .player-prop-body{display:grid;gap:10px}
      .prop-market-group{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}.prop-market-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid #eef2f7}.prop-market-head strong{color:#0f172a}.prop-market-head span{font-size:.78rem;color:#64748b;font-weight:700}
      .book-list{display:grid}.book-row{display:grid;grid-template-columns:minmax(110px,1.2fr) minmax(92px,.8fr) minmax(86px,.7fr) minmax(92px,.7fr);gap:10px;align-items:center;padding:11px 14px;border:0;border-top:1px solid #f1f5f9;background:#fff;text-align:left;cursor:pointer;color:#0f172a}.book-row:first-child{border-top:0}.book-row:hover{background:#f8fafc}.book-row .book-name{font-weight:800}.book-row .book-line{font-weight:800;color:#1d4ed8}.book-row .book-chance{font-weight:800}.book-row .book-price{color:#64748b;text-align:right}.book-row small{display:block;color:#94a3b8;font-weight:600;margin-top:2px}
      .prop-detail-hero{--team-color:#2563eb!important;background:linear-gradient(135deg,#f8fafc,#eef3f9)!important;border:1px solid #dbe3ec!important}.prop-detail-identity{display:flex;gap:16px;align-items:center}.prop-detail-photo,.prop-detail-fallback{width:82px;height:82px;border-radius:18px;background:#e8edf4;border:1px solid #d7dee8}.prop-detail-photo{object-fit:cover;object-position:center top}.prop-detail-fallback{display:grid;place-items:center;color:#334155;font-weight:900;font-size:1.25rem}
      #propsView .prop-record-grid b,#propsView .prop-filter.active{color:#1d4ed8!important}#propsView .prop-filter.active{border-color:#93a8c4!important;background:#eef3f9!important}
      body.theme-dark .player-prop-card,body.theme-dark .prop-market-group,body.theme-dark .book-row{background:#111827;border-color:#263244;color:#f8fafc}body.theme-dark .player-prop-toggle{color:#f8fafc}body.theme-dark .player-prop-toggle:hover,body.theme-dark .book-row:hover{background:#162033}body.theme-dark .player-prop-body{background:#0b1220;border-color:#263244}body.theme-dark .prop-market-head{border-color:#263244}body.theme-dark .prop-market-head strong,body.theme-dark .book-row{color:#f8fafc}body.theme-dark .player-prop-copy p,body.theme-dark .prop-market-head span,body.theme-dark .book-row .book-price{color:#94a3b8}
      body.theme-dark .prop-search-control input{background:#0b1220;border-color:#263244;color:#f8fafc}
      @media(max-width:700px){.player-prop-toggle{align-items:flex-start}.player-prop-meta{gap:6px}.book-row{grid-template-columns:1fr 1fr}.book-row .book-price{text-align:left}.prop-headshot,.prop-avatar-fallback{width:48px;height:48px;flex-basis:48px}}
    `;
    document.head.appendChild(style);
  }

  function photoMarkup(p,detail=false){
    const imgClass=detail?"prop-detail-photo":"prop-headshot",fallback=detail?"prop-detail-fallback":"prop-avatar-fallback";
    if(p?.headshot)return `<img class="${imgClass}" src="${esc(p.headshot)}" alt="${esc(p.player)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;${fallback}&quot;>${esc(initials(p.player))}</div>'">`;
    return `<div class="${fallback}">${esc(initials(p?.player))}</div>`;
  }

  function activeRows(data){
    const all=data?.props||[];
    const weekRows=selectedPropWeek==="all"?all.filter(p=>new Date(p.commenceTime).getTime()>Date.now()-90*60000):all.filter(p=>String(p.week)===selectedPropWeek);
    const categoryRows=currentCategory==="Top Props"?weekRows:weekRows.filter(p=>p.category===currentCategory);
    const query=playerSearch.trim().toLowerCase();
    return query?categoryRows.filter(p=>String(p.player||"").toLowerCase().includes(query)):categoryRows;
  }

  function groupPlayers(rows){
    const map=new Map();
    for(const row of rows){
      const key=`${row.eventId}|${row.player}`;
      if(!map.has(key))map.set(key,{key,player:row.player,matchup:row.matchup,headshot:row.headshot,rows:[]});
      map.get(key).rows.push(row);
    }
    return [...map.values()].sort((a,b)=>{
      const ap=Math.max(...a.rows.map(r=>Number(r.hitProbability)||0));
      const bp=Math.max(...b.rows.map(r=>Number(r.hitProbability)||0));
      return bp-ap||a.player.localeCompare(b.player);
    });
  }

  function marketGroups(rows){
    const map=new Map();
    for(const row of rows){
      const key=row.market||row.marketLabel;
      if(!map.has(key))map.set(key,{label:row.marketLabel||key,rows:[]});
      map.get(key).rows.push(row);
    }
    return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label));
  }

  function providerRows(rows){
    const best=new Map();
    for(const row of rows){
      const key=`${row.providerKey||row.provider}|${row.line}|${row.pick}`;
      const old=best.get(key);
      if(!old||Number(row.hitProbability)>Number(old.hitProbability))best.set(key,row);
    }
    return [...best.values()].sort((a,b)=>(Number(b.hitProbability)||0)-(Number(a.hitProbability)||0)||String(a.provider).localeCompare(String(b.provider)));
  }

  function playerCard(group){
    const markets=marketGroups(group.rows);
    const providers=new Set(group.rows.map(r=>r.provider).filter(Boolean));
    const top=Math.max(...group.rows.map(r=>Number(r.hitProbability)||0));
    return `<article class="player-prop-card" data-player-key="${esc(group.key)}">
      <button class="player-prop-toggle" type="button" aria-expanded="false">
        <span class="player-prop-left">${photoMarkup(group)}<span class="player-prop-copy"><small>${providers.size} sportsbook${providers.size===1?"":"s"}</small><h3>${esc(group.player)}</h3><p>${esc(group.matchup)}</p></span></span>
        <span class="player-prop-meta"><span class="prop-count-pill">${markets.length} prop${markets.length===1?"":"s"}</span><span class="prop-count-pill">Top ${pct(top)}</span><span class="prop-chevron">⌄</span></span>
      </button>
      <div class="player-prop-body">
        ${markets.map(m=>{
          const books=providerRows(m.rows);
          return `<section class="prop-market-group"><div class="prop-market-head"><strong>${esc(m.label)}</strong><span>${books.length} offer${books.length===1?"":"s"}</span></div><div class="book-list">${books.map(p=>`<button class="book-row" type="button" data-prop-id="${esc(p.id)}"><span class="book-name">${esc(p.provider)}<small>${p.multiplier!=null?`${esc(p.multiplier)}x multiplier`:p.price!=null?price(p.price):"Standard"}</small></span><span class="book-line">${esc(p.pick)} ${esc(p.line)}</span><span class="book-chance">${pct(p.hitProbability)}<small>${esc(p.confidence)} confidence</small></span><span class="book-price">${new Date(p.capturedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</span></button>`).join("")}</div></section>`;
        }).join("")}
      </div>
    </article>`;
  }

  async function loadProps(force=false,requestedLeague=null){
    installStyles();
    if(requestedLeague==="nfl"||requestedLeague==="cfb")selectedLeague=requestedLeague;
    const key=selectedLeague;
    if(cache[key]&&!force){renderProps(cache[key],key);return cache[key]}
    try{
      const res=await fetch(`${dataUrl(key)}?v=${Date.now()}`,{cache:"no-store"});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();
      try{const schedule=await (await fetch(`${key==="nfl"?"data/nfl.json":"data/live.json"}?v=${Date.now()}`,{cache:"no-store"})).json(),clean=x=>String(x||"").toLowerCase().replace(/[^a-z0-9]/g,"");const weeks=new Map((schedule.games||[]).map(g=>[`${clean(g.away)}|${clean(g.home)}`,g.week]));for(const p of data.props||[])p.week=weeks.get(`${clean(p.away)}|${clean(p.home)}`)??p.week??"Upcoming"}catch{}
      cache[key]=data;if(selectedLeague===key)renderProps(data,key);return data;
    }catch{
      const empty={league:key==="nfl"?"NFL":"College Football",props:[],providers:[],notice:`No ${key==="nfl"?"NFL":"college football"} player props are available right now.`};
      if(selectedLeague===key)renderProps(empty,key);return empty;
    }
  }

  function renderProps(data,key=selectedLeague){
    if(key!==selectedLeague)return;
    installStyles();
    const stored=data?.props||[],all=stored.filter(p=>new Date(p.commenceTime).getTime()>Date.now()-90*60000),weeks=[...new Set(stored.map(p=>p.week).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
    let weekSelect=document.getElementById("propWeek");if(!weekSelect){const row=document.querySelector(".prop-filter-row");row?.insertAdjacentHTML("beforebegin",'<label class="prop-search-control">Search players <input id="propPlayerSearch" type="search" placeholder="Enter a player name" autocomplete="off"></label><label class="prop-week-control">Week <select id="propWeek"><option value="all">All available weeks</option></select></label>');weekSelect=document.getElementById("propWeek");weekSelect?.addEventListener("change",()=>{selectedPropWeek=weekSelect.value;renderProps(data,key)});document.getElementById("propPlayerSearch")?.addEventListener("input",event=>{playerSearch=event.target.value;renderProps(data,key)})}if(weekSelect){weekSelect.innerHTML='<option value="all">All available weeks</option>'+weeks.map(w=>`<option value="${esc(w)}">Week ${esc(w)}</option>`).join("");weekSelect.value=weeks.includes(Number(selectedPropWeek))||weeks.includes(selectedPropWeek)?selectedPropWeek:"all"}const searchInput=document.getElementById("propPlayerSearch");if(searchInput&&searchInput.value!==playerSearch)searchInput.value=playerSearch;
    const rows=activeRows(data),players=groupPlayers(rows);
    const holder=document.getElementById("propCards"),empty=document.getElementById("propsEmpty"),active=document.getElementById("activePropCount"),desc=document.getElementById("propsDescription"),topCat=document.getElementById("propTopCategory"),title=document.getElementById("propsTitle"),activeLeague=document.getElementById("activePropLeague"),recordEl=document.getElementById("propRecord"),pctEl=document.getElementById("propPct"),sampleEl=document.getElementById("propSample");
    const leagueName=key==="nfl"?"NFL":"College Football";
    if(title)title.textContent=`${leagueName} Player Props`;if(activeLeague)activeLeague.textContent=leagueName;
    if(active)active.textContent=players.length;
    const record=data?.record||{wins:0,losses:0,pushes:0,graded:0},decisions=Number(record.wins||0)+Number(record.losses||0);if(recordEl)recordEl.textContent=`${record.wins||0}–${record.losses||0}${record.pushes?`–${record.pushes}P`:""}`;if(pctEl)pctEl.textContent=decisions?`${(Number(record.wins)/decisions*100).toFixed(1)}%`:"—";if(sampleEl)sampleEl.textContent=`${record.graded||0} graded prop${Number(record.graded)===1?"":"s"}`;
    if(desc)desc.textContent=`${leagueName} props are grouped by player. Open a player to compare every available prop and sportsbook in one place.`;
    if(topCat){const counts={};for(const p of all)counts[p.category]=(counts[p.category]||0)+1;topCat.textContent=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—"}
    if(!holder||!empty)return;
    empty.classList.toggle("view-hidden",players.length>0);
    if(!players.length){holder.innerHTML="";const copy=document.getElementById("propsEmptyCopy");if(copy)copy.textContent=data?.notice||`No ${leagueName} ${currentCategory.toLowerCase()} are available right now.`;return}
    holder.innerHTML=players.map(playerCard).join("");
    holder.querySelectorAll(".player-prop-toggle").forEach(btn=>btn.addEventListener("click",()=>{const card=btn.closest(".player-prop-card"),open=!card.classList.contains("open");card.classList.toggle("open",open);btn.setAttribute("aria-expanded",open?"true":"false")}));
    holder.querySelectorAll("[data-prop-id]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const p=(data.props||[]).find(x=>x.id===btn.dataset.propId);openProp(p)}));
  }

  function openProp(p){
    if(!p)return;const dialog=document.getElementById("gameDialog"),body=document.getElementById("detailBody");if(!dialog||!body)return;
    const probability=Number(p.hitProbability)||50,edge=Math.abs(probability-50).toFixed(1);
    body.innerHTML=`<div class="detail-hero prop-detail-hero"><div class="prop-detail-identity">${photoMarkup(p,true)}<div><p class="eyebrow">PLAYER PROP · ${esc(p.provider)}</p><h2>${esc(p.player)}</h2><p>${esc(p.matchup)}</p></div></div><div class="score-projection"><div><span>${esc(p.marketLabel)}</span><strong>${esc(p.pick)} ${esc(p.line)}</strong></div><div><span>Model hit chance</span><strong>${pct(probability)}</strong></div></div></div><section class="detail-section"><div class="section-title"><span class="eyebrow">MODEL READ</span><h3>${esc(p.confidence)} confidence</h3></div><div class="keys-grid"><div><span>Estimated hit probability</span><strong>${pct(probability)}</strong></div><div><span>Edge above 50/50</span><strong>${edge}%</strong></div><div><span>Sportsbook / DFS</span><strong>${esc(p.provider)}</strong></div><div><span>Price / multiplier</span><strong>${p.multiplier!=null?`${esc(p.multiplier)}x`:price(p.price)||"Standard"}</strong></div></div><p class="detail-copy">This percentage is based on the connected market lines and prices. Compare the books above before choosing a line.</p></section>`;
    if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
  }

  document.addEventListener("click",e=>{
    const filter=e.target.closest?.(".prop-filter");if(filter){currentCategory=filter.textContent.trim();setTimeout(()=>loadProps(false,selectedLeague),0)}
    const mode=e.target.closest?.("[data-market-view='props']");if(mode)setTimeout(()=>loadProps(false,selectedLeague),0);
    const league=e.target.closest?.(".league-tab");if(league){const requested=league.dataset.league;if(requested==="nfl"||requested==="cfb"){selectedLeague=requested;localStorage.setItem("gridiron-league",requested);const holder=document.getElementById("propCards");if(holder)holder.innerHTML="";setTimeout(()=>loadProps(true,requested),50)}}
  });

  const filterRow=document.querySelector(".prop-filter-row");
  if(filterRow&&![...filterRow.querySelectorAll(".prop-filter")].some(button=>button.textContent.trim()==="Kicking")){
    const kicking=document.createElement("button");
    kicking.className="prop-filter";kicking.type="button";kicking.textContent="Kicking";filterRow.appendChild(kicking);
  }
  installStyles();
  window.gridironProps={load:loadProps,setLeague:league=>{if(league==="nfl"||league==="cfb"){selectedLeague=league;return loadProps(true,league)}}};
  import("./ai-plays.js?v=20260917-5").catch(error=>console.error("AI plays failed to load",error));
  setTimeout(()=>loadProps(false,selectedLeague),500);
})();
