(()=>{
  const cache={nfl:null,cfb:null};
  let currentCategory="Top Props";
  const escHtml=value=>String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const pct=value=>Number.isFinite(Number(value))?`${Number(value).toFixed(1)}%`:"—";
  const price=value=>{const n=Number(value);return Number.isFinite(n)?(n>0?`+${n}`:`${n}`):""};
  const activeLeagueKey=()=>{
    const active=document.querySelector(".league-tab.active")?.dataset?.league;
    if(active==="nfl"||active==="cfb")return active;
    return localStorage.getItem("gridiron-league")==="nfl"?"nfl":"cfb";
  };
  const dataUrl=key=>key==="nfl"?"data/props-nfl.json":"data/props-cfb.json";
  const confidenceClass=value=>String(value||"").toLowerCase();
  const initials=name=>String(name||"").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase();

  function installStyles(){
    if(document.getElementById("gridiron-prop-polish"))return;
    const style=document.createElement("style");style.id="gridiron-prop-polish";style.textContent=`
      .prop-card{border:1px solid #d7dee8!important;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%)!important;box-shadow:0 10px 30px rgba(15,23,42,.07)!important;border-radius:18px!important;overflow:hidden;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
      .prop-card:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(15,23,42,.11)!important;border-color:#b9c5d4!important}
      .prop-card .game-top{align-items:center!important;gap:14px}.prop-player-wrap{display:flex;align-items:center;gap:14px;min-width:0}
      .prop-headshot{width:58px;height:58px;border-radius:14px;object-fit:cover;object-position:center top;background:#e8edf4;border:1px solid #d7dee8;flex:0 0 58px}
      .prop-avatar-fallback{width:58px;height:58px;border-radius:14px;display:grid;place-items:center;background:#e8edf4;border:1px solid #d7dee8;color:#334155;font-weight:900;font-size:1rem;flex:0 0 58px}
      .prop-player-copy{min-width:0}.prop-player-copy h3{margin:2px 0 3px!important;color:#0f172a!important;font-size:1.08rem!important}.prop-player-copy p{color:#64748b!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .prop-card .eyebrow{color:#64748b!important}.prop-card .model-strip{border-top:1px solid #e5eaf0!important;border-bottom:1px solid #e5eaf0!important;background:#f8fafc!important}.prop-card .model-strip span,.prop-card .game-market{color:#64748b!important}.prop-card .model-strip strong{color:#0f172a!important}.prop-card .probability strong{color:#1d4ed8!important}
      .prop-card .result-badge{border-radius:999px!important;padding:7px 10px!important;font-size:.72rem!important;letter-spacing:.02em!important;text-transform:none!important;border:1px solid transparent!important}.prop-card .result-badge.high{background:#e8eefc!important;color:#1e3a8a!important;border-color:#c8d5f3!important}.prop-card .result-badge.medium{background:#f1f5f9!important;color:#334155!important;border-color:#d7dee8!important}.prop-card .result-badge.low{background:#f8fafc!important;color:#64748b!important;border-color:#e2e8f0!important}
      body.theme-dark .prop-card{background:linear-gradient(180deg,#111827 0%,#0f172a 100%)!important;border-color:#263244!important;box-shadow:0 10px 30px rgba(0,0,0,.2)!important}body.theme-dark .prop-player-copy h3,body.theme-dark .prop-card .model-strip strong{color:#f8fafc!important}body.theme-dark .prop-player-copy p,body.theme-dark .prop-card .eyebrow,body.theme-dark .prop-card .model-strip span,body.theme-dark .prop-card .game-market{color:#94a3b8!important}body.theme-dark .prop-card .model-strip{background:#0b1220!important;border-color:#263244!important}.theme-dark .prop-headshot,.theme-dark .prop-avatar-fallback{background:#172033;border-color:#263244;color:#cbd5e1}
      .prop-detail-hero{--team-color:#2563eb!important;background:linear-gradient(135deg,#f8fafc 0%,#eef3f9 100%)!important;border:1px solid #dbe3ec!important}.prop-detail-identity{display:flex;gap:16px;align-items:center}.prop-detail-photo{width:82px;height:82px;border-radius:18px;object-fit:cover;object-position:center top;background:#e8edf4;border:1px solid #d7dee8}.prop-detail-fallback{width:82px;height:82px;border-radius:18px;display:grid;place-items:center;background:#e8edf4;border:1px solid #d7dee8;color:#334155;font-weight:900;font-size:1.25rem}
      .prop-detail-hero h2,.prop-detail-hero .score-projection strong{color:#0f172a!important;text-shadow:none!important}.prop-detail-hero .eyebrow,.prop-detail-hero p,.prop-detail-hero .score-projection span{color:#64748b!important}.prop-detail-hero .score-projection{border-top-color:#dbe3ec!important}body.theme-dark .prop-detail-hero{background:linear-gradient(135deg,#111827 0%,#0f172a 100%)!important;border-color:#263244!important}body.theme-dark .prop-detail-hero h2,body.theme-dark .prop-detail-hero .score-projection strong{color:#f8fafc!important}body.theme-dark .prop-detail-hero p,body.theme-dark .prop-detail-hero .eyebrow,body.theme-dark .prop-detail-hero .score-projection span{color:#94a3b8!important}
      #propsView .prop-record-grid b,#propsView .prop-filter.active{color:#1d4ed8!important}#propsView .prop-filter.active{border-color:#93a8c4!important;background:#eef3f9!important}body.theme-dark #propsView .prop-filter.active{background:#162033!important;border-color:#40516a!important;color:#bfdbfe!important}
      @media(max-width:640px){.prop-headshot,.prop-avatar-fallback{width:48px;height:48px;flex-basis:48px}.prop-card .game-top{align-items:flex-start!important}.prop-detail-photo,.prop-detail-fallback{width:66px;height:66px}}
    `;document.head.appendChild(style);
  }

  function photoMarkup(p,detail=false){
    const sizeClass=detail?"prop-detail-photo":"prop-headshot",fallbackClass=detail?"prop-detail-fallback":"prop-avatar-fallback";
    if(p?.headshot)return `<img class="${sizeClass}" src="${escHtml(p.headshot)}" alt="${escHtml(p.player)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;${fallbackClass}&quot;>${escHtml(initials(p.player))}</div>'">`;
    return `<div class="${fallbackClass}">${escHtml(initials(p?.player))}</div>`;
  }

  async function loadProps(force=false,requestedLeague=null){
    installStyles();
    const key=requestedLeague==="nfl"||requestedLeague==="cfb"?requestedLeague:activeLeagueKey();
    if(cache[key]&&!force){renderProps(cache[key],key);return cache[key]}
    try{
      const res=await fetch(`${dataUrl(key)}?v=${Date.now()}`,{cache:"no-store"});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();cache[key]=data;
      if(activeLeagueKey()===key)renderProps(data,key);
      return data;
    }catch(error){
      const empty={league:key==="nfl"?"NFL":"College Football",props:[],providers:[],notice:`No ${key==="nfl"?"NFL":"college football"} player props are available from the connected feeds right now.`};
      if(activeLeagueKey()===key)renderProps(empty,key);return empty;
    }
  }

  function visibleProps(data){
    const all=(data?.props||[]).filter(p=>new Date(p.commenceTime).getTime()>Date.now()-90*60000);
    if(currentCategory==="Top Props")return all.slice(0,60);
    return all.filter(p=>p.category===currentCategory).slice(0,80);
  }

  function renderProps(data,key=activeLeagueKey()){
    installStyles();
    if(key!==activeLeagueKey())return;
    const props=visibleProps(data),all=(data?.props||[]).filter(p=>new Date(p.commenceTime).getTime()>Date.now()-90*60000);
    const holder=document.getElementById("propCards"),empty=document.getElementById("propsEmpty"),active=document.getElementById("activePropCount"),desc=document.getElementById("propsDescription"),topCat=document.getElementById("propTopCategory"),title=document.getElementById("propsTitle"),activeLeague=document.getElementById("activePropLeague");
    const leagueName=key==="nfl"?"NFL":"College Football";
    if(title)title.textContent=`${leagueName} Player Props`;if(activeLeague)activeLeague.textContent=leagueName;if(active)active.textContent=all.length;
    if(desc){const providers=(data?.providers||[]).slice(0,7).join(", ");desc.textContent=providers?`${leagueName} player props from ${providers}${(data.providers||[]).length>7?" and more":""}. Tap a prop to see the model view.`:`${leagueName} sportsbook and DFS player props.`}
    if(topCat){const counts={};for(const p of all)counts[p.category]=(counts[p.category]||0)+1;const best=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];topCat.textContent=best?.[0]||"—"}
    if(!holder||!empty)return;empty.classList.toggle("view-hidden",props.length>0);
    if(!props.length){holder.innerHTML="";const copy=document.getElementById("propsEmptyCopy");if(copy)copy.textContent=data?.notice||`No ${leagueName} ${currentCategory.toLowerCase()} are available from the connected feeds right now.`;return}
    holder.innerHTML=props.map(p=>{const provider=escHtml(p.provider),player=escHtml(p.player),market=escHtml(p.marketLabel),matchup=escHtml(p.matchup);return `<article class="game prop-card" data-prop-id="${escHtml(p.id)}" tabindex="0" role="button" aria-label="Open ${player} ${market} prop"><div class="game-top"><div class="prop-player-wrap">${photoMarkup(p)}<div class="prop-player-copy"><span class="eyebrow">${provider}</span><h3>${player}</h3><p>${matchup}</p></div></div><span class="result-badge ${confidenceClass(p.confidence)}">${escHtml(p.confidence)} confidence</span></div><div class="model-strip"><div><span>Prop</span><strong>${market}</strong></div><div><span>Model pick</span><strong>${escHtml(p.pick)} ${escHtml(p.line)}</strong></div><div class="probability"><span>Hit chance</span><strong>${pct(p.hitProbability)}</strong></div></div><div class="game-market"><span>${provider}${p.price!=null?` · ${price(p.price)}`:""}${p.multiplier!=null?` · ${escHtml(p.multiplier)}x`:""}</span><span>Updated ${new Date(p.capturedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</span></div></article>`}).join("");
    holder.querySelectorAll("[data-prop-id]").forEach(card=>{const open=()=>openProp(data.props.find(p=>p.id===card.dataset.propId));card.addEventListener("click",open);card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}})});
  }

  function openProp(p){
    if(!p)return;installStyles();const dialog=document.getElementById("gameDialog"),body=document.getElementById("detailBody");if(!dialog||!body)return;const probability=Number(p.hitProbability)||50,edge=Math.abs(probability-50).toFixed(1);
    body.innerHTML=`<div class="detail-hero prop-detail-hero"><div class="prop-detail-identity">${photoMarkup(p,true)}<div><p class="eyebrow">PLAYER PROP · ${escHtml(p.provider)}</p><h2>${escHtml(p.player)}</h2><p>${escHtml(p.matchup)}</p></div></div><div class="score-projection"><div><span>${escHtml(p.marketLabel)}</span><strong>${escHtml(p.pick)} ${escHtml(p.line)}</strong></div><div><span>Model hit chance</span><strong>${pct(probability)}</strong></div></div></div><section class="detail-section"><div class="section-title"><span class="eyebrow">MODEL READ</span><h3>${escHtml(p.confidence)} confidence</h3></div><div class="keys-grid"><div><span>Estimated hit probability</span><strong>${pct(probability)}</strong></div><div><span>Edge above 50/50</span><strong>${edge}%</strong></div><div><span>Provider</span><strong>${escHtml(p.provider)}</strong></div><div><span>Price / multiplier</span><strong>${p.multiplier!=null?`${escHtml(p.multiplier)}x`:price(p.price)||"Standard"}</strong></div></div><p class="detail-copy">This percentage is a market-consensus estimate built from the connected sportsbook and DFS lines and prices. It is not a guarantee, and it will move when books change the line.</p></section>`;
    if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
  }

  document.addEventListener("click",e=>{
    const filter=e.target.closest?.(".prop-filter");if(filter){currentCategory=filter.textContent.trim();setTimeout(()=>loadProps(false),0)}
    const mode=e.target.closest?.("[data-market-view='props']");if(mode)setTimeout(()=>loadProps(false),0);
    const league=e.target.closest?.(".league-tab");if(league){const requested=league.dataset.league;setTimeout(()=>loadProps(true,requested),25)}
  });
  installStyles();window.gridironProps={load:loadProps};setTimeout(()=>loadProps(false),500);
})();
