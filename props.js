(()=>{
  const cache={nfl:null,cfb:null};
  let currentCategory="Top Props";
  const escHtml=value=>String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const pct=value=>Number.isFinite(Number(value))?`${Number(value).toFixed(1)}%`:"—";
  const price=value=>{const n=Number(value);return Number.isFinite(n)?(n>0?`+${n}`:`${n}`):""};
  const leagueKey=()=>window.state?.league==="nfl"?"nfl":"cfb";
  const dataUrl=key=>key==="nfl"?"data/props-nfl.json":"data/props-cfb.json";
  const confidenceClass=value=>String(value||"").toLowerCase();

  async function loadProps(force=false){
    const key=leagueKey();
    if(cache[key]&&!force){renderProps(cache[key]);return cache[key]}
    try{
      const res=await fetch(`${dataUrl(key)}?v=${Date.now()}`,{cache:"no-store"});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();cache[key]=data;renderProps(data);return data;
    }catch(error){
      const empty={league:key==="nfl"?"NFL":"College Football",props:[],providers:[],notice:"Player prop feed is loading. Try again shortly."};
      renderProps(empty);return empty;
    }
  }

  function visibleProps(data){
    const all=(data?.props||[]).filter(p=>new Date(p.commenceTime).getTime()>Date.now()-90*60000);
    if(currentCategory==="Top Props")return all.filter(p=>Number(p.hitProbability)>=55).slice(0,60);
    return all.filter(p=>p.category===currentCategory).slice(0,80);
  }

  function renderProps(data){
    const props=visibleProps(data);
    const all=(data?.props||[]).filter(p=>new Date(p.commenceTime).getTime()>Date.now()-90*60000);
    const holder=document.getElementById("propCards");
    const empty=document.getElementById("propsEmpty");
    const active=document.getElementById("activePropCount");
    const desc=document.getElementById("propsDescription");
    const topCat=document.getElementById("propTopCategory");
    if(active)active.textContent=all.length;
    if(desc){
      const providers=(data?.providers||[]).slice(0,7).join(", ");
      desc.textContent=providers?`Live player props from ${providers}${(data.providers||[]).length>7?" and more":""}. Tap a prop to see the model view.`:"Live sportsbook and DFS player props with a separate model view and record.";
    }
    if(topCat){
      const counts={};for(const p of all)counts[p.category]=(counts[p.category]||0)+1;
      const best=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];topCat.textContent=best?.[0]||"—";
    }
    if(!holder||!empty)return;
    empty.classList.toggle("view-hidden",props.length>0);
    if(!props.length){
      holder.innerHTML="";
      const copy=document.getElementById("propsEmptyCopy");
      if(copy)copy.textContent=data?.notice||`No ${currentCategory.toLowerCase()} are available from the connected feeds right now.`;
      return;
    }
    holder.innerHTML=props.map(p=>{
      const provider=escHtml(p.provider), player=escHtml(p.player), market=escHtml(p.marketLabel), matchup=escHtml(p.matchup);
      return `<article class="game prop-card" data-prop-id="${escHtml(p.id)}" tabindex="0" role="button" aria-label="Open ${player} ${market} prop">
        <div class="game-top"><div><span class="eyebrow">${provider}</span><h3>${player}</h3><p>${matchup}</p></div><span class="result-badge ${confidenceClass(p.confidence)}">${escHtml(p.confidence)} confidence</span></div>
        <div class="model-strip">
          <div><span>Prop</span><strong>${market}</strong></div>
          <div><span>Model pick</span><strong>${escHtml(p.pick)} ${escHtml(p.line)}</strong></div>
          <div class="probability"><span>Hit chance</span><strong>${pct(p.hitProbability)}</strong></div>
        </div>
        <div class="game-market"><span>${provider}${p.price!=null?` · ${price(p.price)}`:""}${p.multiplier!=null?` · ${escHtml(p.multiplier)}x`:""}</span><span>Updated ${new Date(p.capturedAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span></div>
      </article>`;
    }).join("");
    holder.querySelectorAll("[data-prop-id]").forEach(card=>{
      const open=()=>openProp(data.props.find(p=>p.id===card.dataset.propId));
      card.addEventListener("click",open);card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}});
    });
  }

  function openProp(p){
    if(!p)return;
    const dialog=document.getElementById("gameDialog"),body=document.getElementById("detailBody");
    if(!dialog||!body)return;
    const probability=Number(p.hitProbability)||50;
    const edge=Math.abs(probability-50).toFixed(1);
    body.innerHTML=`<div class="detail-hero" style="--team-color:#39ff88">
      <p class="eyebrow">PLAYER PROP · ${escHtml(p.provider)}</p>
      <h2>${escHtml(p.player)}</h2><p>${escHtml(p.matchup)}</p>
      <div class="score-projection"><div><span>${escHtml(p.marketLabel)}</span><strong>${escHtml(p.pick)} ${escHtml(p.line)}</strong></div><div><span>Model hit chance</span><strong>${pct(probability)}</strong></div></div>
    </div>
    <section class="detail-section"><div class="section-title"><span class="eyebrow">MODEL READ</span><h3>${escHtml(p.confidence)} confidence</h3></div>
      <div class="keys-grid"><div><span>Estimated hit probability</span><strong>${pct(probability)}</strong></div><div><span>Edge above 50/50</span><strong>${edge}%</strong></div><div><span>Provider</span><strong>${escHtml(p.provider)}</strong></div><div><span>Price / multiplier</span><strong>${p.multiplier!=null?`${escHtml(p.multiplier)}x`:price(p.price)||"Standard"}</strong></div></div>
      <p class="detail-copy">This percentage is a market-consensus estimate built from the connected sportsbook and DFS lines and prices. It is not a guarantee, and it will move when books change the line.</p>
    </section>`;
    if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
  }

  document.addEventListener("click",e=>{
    const filter=e.target.closest?.(".prop-filter");
    if(filter){currentCategory=filter.textContent.trim();setTimeout(()=>loadProps(false),0)}
    const mode=e.target.closest?.("[data-market-view='props']");if(mode)setTimeout(()=>loadProps(false),0);
    const league=e.target.closest?.(".league-tab");if(league)setTimeout(()=>loadProps(true),350);
  });
  window.gridironProps={load:loadProps};
  setTimeout(()=>loadProps(false),500);
})();
