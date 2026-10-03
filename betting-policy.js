(function(root){
  const number=v=>v==null||v===""?null:(Number.isFinite(Number(v))?Number(v):null);
  const clean=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const implied=price=>{const n=number(price);return !n?null:n<0?-n/(-n+100):100/(n+100);};
  function stake(row){
    if(row.blockers?.length)return 0;
    const prob=number(row.prob)||0,value=number(row.valueEdge)||0,edge=Math.abs(number(row.edge)||0),books=number(row.books)||0;
    if((row.uncertainty||0)>=2.75||(row.disagreement||0)>=2.25)return 0;
    if(row.type!=="Player Prop"&&row.tier==="Low")return 0;
    if(row.type==="Spread"||row.type==="Total"){
      if(books<3||prob<55.5||value<3.5||edge<2.5)return 0;
      if(books>=4&&prob>=62&&value>=7&&edge>=5)return 3;
      return prob>=58.5&&value>=5&&edge>=3.5?2:1;
    }
    if(row.type==="Moneyline"){
      if(books<3||prob<57||value<4||row.price< -180||row.price>300)return 0;
      return books>=4&&prob>=66&&value>=8?3:prob>=61&&value>=6?2:1;
    }
    if(row.type==="Player Prop"){
      if((row.modelSample||0)<5||prob<57||value<3.5||row.dfs)return 0;
      return prob>=65&&value>=8&&row.modelSample>=7?3:prob>=61&&value>=5&&row.modelSample>=6?2:1;
    }
    return 0;
  }
  function gameRows(game,events,now=Date.now()){
    const p=game.prediction||{},kickoff=new Date(game.date).getTime(),asOf=new Date(p.asOf).getTime(),blockers=[];
    if(!Number.isFinite(kickoff)||kickoff<=now)blockers.push("Game has started");
    if(!Number.isFinite(asOf)||asOf>now+60000||now-asOf>2*3600000)blockers.push("Model forecast needs refreshing");
    if(p.dataQuality?.eligible===false)blockers.push(...(p.dataQuality.reasons||["Data checks failed"]));
    const event=(events||[]).find(e=>clean(e.home_team)===clean(game.home)&&clean(e.away_team)===clean(game.away));
    const fresh=new Set(event?.freshBookmakers||[]),offers=[];
    for(const book of event?.bookmakers||[]){
      if(!fresh.has(clean(book.title||book.key)))continue;
      const raw=book.last_update||book.lastUpdate||event.oddsFetchedAt,time=new Date(raw).getTime(),limit=kickoff-now<=6*3600000?90*60000:2*3600000;
      if(!raw||!Number.isFinite(time)||time>now+60000||now-time>limit)continue;
      for(const market of book.markets||[])for(const outcome of market.outcomes||[])if(implied(outcome.price)!=null)offers.push({...outcome,key:market.key,book:book.title||book.key});
    }
    const rows=[],add=(type,name,point,prob,edge,tier,market,disagreement)=>{
      const matches=offers.filter(o=>o.key===market&&clean(o.name)===clean(name)&&(point==null||number(o.point)!=null&&Math.abs(Number(o.point)-point)<.01));
      const books=new Set(matches.map(o=>clean(o.book))).size,offer=matches.sort((a,b)=>Number(b.price)-Number(a.price))[0],price=number(offer?.price);
      const reasons=[...blockers];if(!offer)reasons.push("Fresh quote at the modeled line unavailable");
      if(type!=="Moneyline"&&(price==null||price< -125||price>125))reasons.push("Price outside standard betting range");
      const row={type,pick:type==="Moneyline"?name:`${name} ${point>0&&type==="Spread"?"+":""}${point}`,side:name,line:point,matchup:`${game.away} @ ${game.home}`,gameId:String(game.id),prob,price,book:offer?.book||null,quoteUpdatedAt:offer?event?.oddsFetchedAt||null:null,valueEdge:price==null?null:prob-implied(price)*100,edge,books,tier,uncertainty:Number(p.injuryImpact?.uncertainty)||0,disagreement:Number(disagreement)||0,blockers:reasons,q:{label:books>=3?"Strong":"Limited",weight:books>=3?1:.72},modelVersion:p.version};
      row.units=stake(row);row.reason=row.units?"Qualified model edge":reasons.length?reasons.join("; "):"Probability, price, evidence or edge below betting thresholds";rows.push(row);
    };
    const homeWin=number(p.homeWin),homeCover=number(p.homeCover),over=number(p.overProb);
    if(homeWin!=null)add("Moneyline",homeWin>=50?game.home:game.away,null,Math.max(homeWin,100-homeWin),0,p.confidenceByMarket?.moneyline||p.confidence||"Low","h2h",p.marketSpreadDeviation);
    if(homeCover!=null&&number(p.marketMargin)!=null){const homePick=homeCover>=50,point=homePick?-Number(p.marketMargin):Number(p.marketMargin);add("Spread",homePick?game.home:game.away,point,Math.max(homeCover,100-homeCover),Math.abs(number(p.spreadEdge)||0),p.confidenceByMarket?.spread||"Low","spreads",p.marketSpreadDeviation);}
    if(over!=null&&number(p.marketTotal)!=null)add("Total",over>=50?"Over":"Under",Number(p.marketTotal),Math.max(over,100-over),Math.abs(number(p.totalEdge)||0),p.confidenceByMarket?.total||"Low","totals",p.marketTotalDeviation);
    return rows;
  }
  function propRow(prop,now=Date.now()){
    const blockers=[],captured=new Date(prop.quoteUpdatedAt||prop.capturedAt).getTime(),kickoff=new Date(prop.commenceTime).getTime(),prob=number(prop.hitProbability)||0,price=number(prop.price),dfs=/prizepicks|underdog/i.test(prop.providerKey||prop.provider||"");
    if(!Number.isFinite(kickoff)||kickoff<=now)blockers.push("Game has started");
    if(!Number.isFinite(captured)||captured>now+60000||now-captured>2*3600000)blockers.push("Prop quote needs refreshing");
    if(prop.dataQuality?.eligible===false)blockers.push(...(prop.dataQuality.reasons||["Prop data checks failed"]));
    if(prop.projectionType!=="hybrid")blockers.push("Independent projection unavailable");
    if(dfs)blockers.push("DFS payout depends on the full entry; sportsbook value cannot be assumed");
    const row={type:"Player Prop",pick:`${prop.player} — ${prop.marketLabel||prop.market}: ${prop.pick} ${prop.line}`,matchup:prop.matchup,prob,price,book:prop.provider,modelSample:Number(prop.modelSample)||0,dfs,valueEdge:dfs||implied(price)==null?null:prob-implied(price)*100,edge:0,books:1,tier:prop.confidence||"Low",blockers,q:{label:"Player evidence",weight:1}};
    row.units=stake(row);row.reason=row.units?"Qualified model edge":blockers.length?blockers.join("; "):"Sample, probability or price edge below betting thresholds";return row;
  }
  root.GridironPolicy={version:1,stake,gameRows,propRow,implied};
})(globalThis);
