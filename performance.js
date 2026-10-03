(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=n=>n==null?'—':`${(n*100).toFixed(1)}%`,num=n=>n==null?'—':Number(n).toFixed(3),record=r=>`${r?.wins||0}–${r?.losses||0}${r?.pushes?'–'+r.pushes+'P':''}`;
  let audit=null,loading=null;
  async function update(){
    const league=typeof state!=='undefined'?state.league:'cfb';
    if(!loading)loading=fetch('data/model-audit.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
    audit=await loading;loading=null;if(!audit||league!==(typeof state!=='undefined'?state.league:'cfb'))return;
    const data=audit[league];if(!data)return;
    for(const [market,prefix] of [['moneyline','outright'],['spread','spread'],['total','total']]){
      const row=data.byMarket?.[market];if(!row)continue;
      const put=(id,value)=>{const e=document.getElementById(id);if(e)e.textContent=value;};
      put(prefix+'Record',record(row));put(prefix+'Pct',pct(row.winRate));put(prefix+'Sample',`${row.plays} saved pregame forecasts · includes No Bet`);
    }
    const note=document.getElementById('performanceNote');if(note)note.textContent='All saved pregame forecasts. Qualified betting results are shown separately below.';
    let panel=document.getElementById('verified-performance');
    if(!panel){panel=document.createElement('section');panel.id='verified-performance';panel.className='performance';document.getElementById('model-performance')?.after(panel);}
    const qualified=data.qualified||{},props=data.props||{},filters=data.filters?.games||{};
    const marketRows=['moneyline','spread','total'].map(m=>{const r=data.byMarket?.[m]||{};return `<tr><td>${m==='moneyline'?'Outright winner':m==='spread'?'Spread':'Total'}</td><td>${r.marketComparisonSamples||0}</td><td>${num(r.modelBrierOnMatchedSamples)}</td><td>${num(r.marketBrierOnMatchedSamples)}</td><td>${pct(r.roi)} (${r.pricedPlays||0} priced)</td></tr>`;}).join('');
    const qprops=props.qualified||{},interval=qualified.winRate95Interval;
    panel.innerHTML=`<div class="performance-head"><div><p class="eyebrow">VERIFIED BETTING PERFORMANCE</p><h2>Qualified plays and market comparison</h2></div><p>Updated ${esc(new Date(audit.updatedAt).toLocaleString())}</p></div><div class="record-grid"><article><span>Qualified game bets</span><strong>${record(qualified)}</strong><b>${pct(qualified.roi)} return</b><small>${qualified.pricedPlays||0} priced bets · ${interval?'Win-rate range '+pct(interval[0])+'–'+pct(interval[1]):'Awaiting completed qualified bets'}</small></article><article><span>Qualified sportsbook props</span><strong>${record(qprops)}</strong><b>${pct(qprops.roi)} return</b><small>${qprops.pricedPlays||0} priced props · DFS entry returns tracked separately</small></article><article><span>Current game filters</span><strong>${filters.qualified||0} qualify</strong><b>${filters.blockedByData||0} blocked by data</b><small>${filters.belowBettingThresholds||0} below betting thresholds · market opportunities, not unique games</small></article></div><div style="overflow-x:auto"><table style="width:100%;text-align:left;border-spacing:12px"><thead><tr><th>Market</th><th>Matched samples</th><th>Model probability error</th><th>Sportsbook probability error</th><th>All-forecast return</th></tr></thead><tbody>${marketRows}</tbody></table></div><p class="method-note">Lower probability error is better. Comparisons use the same games and recorded prices with the sportsbook margin removed. Returns assume one unit per priced play. All-forecast returns include No Bet predictions and are not a recommended betting record. Missing prices are excluded. Historical tracked props: ${props.allTracked?.plays||0}; these are separate from qualified bets.</p>`;
  }
  window.addEventListener('gridiron-data-loaded',update);
  document.querySelectorAll('.league-tab').forEach(button=>button.addEventListener('click',()=>setTimeout(update,150)));
  update();
})();
