import {numeric} from './model-context.mjs';
import {implied,gameRows,propRow} from './betting-policy.mjs';
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const round=n=>n==null?null:Math.round(n*10000)/10000;
export const pregame=(p,g)=>!!p?.asOf&&Number.isFinite(new Date(p.asOf).getTime())&&new Date(p.asOf)<new Date(g.date);
export const profit=(price,win,push=false)=>push?0:!price?null:win?(price<0?100/-price:price/100):-1;
export function summarize(rows){
  const decided=rows.filter(r=>!r.push),priced=rows.filter(r=>r.profit!=null),wins=decided.filter(r=>r.win).length,n=decided.length,p=n?wins/n:0,z=1.96,den=1+z*z/Math.max(1,n),center=(p+z*z/(2*Math.max(1,n)))/den,width=z*Math.sqrt((p*(1-p)+z*z/(4*Math.max(1,n)))/Math.max(1,n))/den;
  const paired=decided.filter(r=>r.marketProb!=null&&r.prob!=null);
  return {plays:rows.length,wins,losses:n-wins,pushes:rows.length-n,winRate:n?round(p):null,winRate95Interval:n?[round(Math.max(0,center-width)),round(Math.min(1,center+width))]:null,
    pricedPlays:priced.length,profitUnits:round(priced.reduce((a,r)=>a+r.profit,0)),roi:round(mean(priced.map(r=>r.profit))),
    brierScore:round(mean(decided.filter(r=>r.prob!=null).map(r=>(r.prob-(r.win?1:0))**2))),marketComparisonSamples:paired.length,
    modelBrierOnMatchedSamples:round(mean(paired.map(r=>(r.prob-(r.win?1:0))**2))),marketBrierOnMatchedSamples:round(mean(paired.map(r=>(r.marketProb-(r.win?1:0))**2))),
    calibration:[.5,.55,.6,.65,.7,.8,.9].map((lower,i,all)=>{const upper=all[i+1]||1.0001,bin=decided.filter(r=>r.prob>=lower&&r.prob<upper);return {lower,upper:Math.min(1,upper),samples:bin.length,predicted:round(mean(bin.map(r=>r.prob))),observed:round(mean(bin.map(r=>r.win?1:0)))};})};
}
export function latestForecasts(games,entries=[],league){
  const latest=new Map();
  const actual=new Map(games.map(g=>[String(g.id),g]));
  for(const entry of [...entries.filter(e=>e.league===league),...games.map(g=>({id:String(g.id),prediction:g.prediction}))]){
    const game=actual.get(String(entry.id));if(!game||!pregame(entry.prediction,game))continue;
    const old=latest.get(String(entry.id));if(!old||new Date(entry.prediction.asOf)>new Date(old.prediction.asOf))latest.set(String(entry.id),{...entry,game});
  }
  return [...latest.values()];
}
export function gameEvaluation(games,entries,league){
  const rows=[],errors=[],excluded={invalidPregame:0,unalignedSpread:0,unalignedTotal:0,missingPregameQuote:0},completed=games.filter(g=>g.statusCompleted||/final/i.test(g.status||''));
  const forecasts=latestForecasts(games,entries,league);excluded.invalidPregame=completed.length-forecasts.filter(e=>e.game.statusCompleted||/final/i.test(e.game.status||'')).length;
  for(const {game:g,prediction:p} of forecasts){
    if(!(g.statusCompleted||/final/i.test(g.status||'')))continue;
    const home=numeric(g.homeScore),away=numeric(g.awayScore);if(home==null||away==null)continue;
    const margin=home-away,total=home+away,quote=p.market,quotedAt=new Date(quote?.capturedAt),goodQuote=quote&&Number.isFinite(quotedAt.getTime())&&quotedAt<new Date(g.date);
    const point=goodQuote?numeric(quote.homePoint):null,line=goodQuote?numeric(quote.total):null;
    const close=g.prediction?.closingConsensus,closeTime=new Date(close?.capturedAt),validClose=Number.isFinite(closeTime.getTime())&&closeTime<new Date(g.date)&&(!goodQuote||closeTime>=quotedAt);
    const marketMargin=validClose&&numeric(close.homePoint)!=null?-Number(close.homePoint):point!=null?-point:null,marketTotal=validClose?numeric(close.total):line;
    errors.push({margin:numeric(p.spread)!=null?Math.abs(-p.spread-margin):null,total:numeric(p.total)!=null?Math.abs(p.total-total):null,marketMargin:marketMargin!=null?Math.abs(marketMargin-margin):null,marketTotal:marketTotal!=null?Math.abs(marketTotal-total):null,version:p.version});
    if(!goodQuote)excluded.missingPregameQuote++;
    const add=(market,homePick,outcome,push,prob,price,oppositePrice,clv)=>{
      const a=implied(price),b=implied(oppositePrice),win=homePick===outcome;
      rows.push({market,gameId:String(g.id),version:p.version,confidence:p.confidenceByMarket?.[market]||p.confidence||'Unknown',win,push,prob:prob==null?null:(homePick?prob:1-prob),marketProb:a!=null&&b!=null?a/(a+b):null,price,profit:profit(price,win,push),clv});
    };
    if(home!==away&&numeric(p.homeWin)!=null){const pick=p.homeWin>=50;add('moneyline',pick,home>away,false,p.homeWin/100,goodQuote?numeric(quote.prices?.[pick?'homeMoneyline':'awayMoneyline']):null,goodQuote?numeric(quote.prices?.[pick?'awayMoneyline':'homeMoneyline']):null,null);}
    if(point!=null&&numeric(p.spread)!=null){
      const pick=-p.spread+point>=0,aligned=numeric(p.marketMargin)!=null&&Math.abs(-p.marketMargin-point)<.01;
      if(!aligned)excluded.unalignedSpread++;
      const closingPoint=validClose?numeric(close.homePoint):null;
      add('spread',pick,margin+point>0,margin+point===0,aligned&&numeric(p.homeCover)!=null?p.homeCover/100:null,numeric(quote.prices?.[pick?'homeSpread':'awaySpread']),numeric(quote.prices?.[pick?'awaySpread':'homeSpread']),closingPoint==null?null:pick?point-closingPoint:closingPoint-point);
    }
    if(line!=null&&numeric(p.total)!=null){
      const pick=p.total>=line,aligned=numeric(p.marketTotal)!=null&&Math.abs(p.marketTotal-line)<.01;if(!aligned)excluded.unalignedTotal++;
      const closingLine=validClose?numeric(close.total):null;
      add('total',pick,total>line,total===line,aligned&&numeric(p.overProb)!=null?p.overProb/100:null,numeric(quote.prices?.[pick?'over':'under']),numeric(quote.prices?.[pick?'under':'over']),closingLine==null?null:pick?closingLine-line:line-closingLine);
    }
  }
  const metrics=values=>({samples:values.length,modelMAE:round(mean(values.map(r=>r.model))),marketMAE:round(mean(values.map(r=>r.market)))});
  const byMarket=Object.fromEntries(['moneyline','spread','total'].map(m=>[m,summarize(rows.filter(r=>r.market===m))]));
  const matchedMargin=errors.filter(e=>e.margin!=null&&e.marketMargin!=null).map(e=>({model:e.margin,market:e.marketMargin})),matchedTotal=errors.filter(e=>e.total!=null&&e.marketTotal!=null).map(e=>({model:e.total,market:e.marketTotal}));
  return {overall:summarize(rows),byMarket,byConfidence:Object.fromEntries(['High','Medium','Low'].map(c=>[c,summarize(rows.filter(r=>r.confidence===c))])),byVersion:Object.fromEntries([...new Set(rows.map(r=>r.version))].map(v=>[v,Object.fromEntries(['moneyline','spread','total'].map(m=>[m,summarize(rows.filter(r=>r.version===v&&r.market===m))]))])),errors:{margin:metrics(matchedMargin),total:metrics(matchedTotal)},excluded};
}
export function qualifiedEvaluation(entries,games,league){
  const actual=new Map(games.map(g=>[String(g.id),g])),rows=[],seen=new Set();
  for(const entry of entries.filter(e=>e.league===league&&e.policyVersion)){
    const g=actual.get(String(entry.id));if(!g||!pregame(entry.prediction,g)||!(g.statusCompleted||/final/i.test(g.status||'')))continue;
    for(const play of entry.qualifiedPlays||[]){
      const key=`${g.id}|${play.type}`;if(seen.has(key))continue;seen.add(key);
      const home=Number(g.homeScore),away=Number(g.awayScore);let win,push=false;
      if(play.type==='Moneyline'){if(home===away){push=true;win=false;}else win=play.side===(home>away?g.home:g.away);}
      else if(play.type==='Spread'){const homePick=play.side===g.home,difference=(homePick?home-away:away-home)+Number(play.line);push=difference===0;win=difference>0;}
      else{const difference=home+away-Number(play.line);push=difference===0;win=play.side==='Over'?difference>0:difference<0;}
      rows.push({win,push,prob:play.prob/100,profit:profit(play.price,win,push),market:play.type,units:play.units});
    }
  }
  return {method:'Only qualified plays actually saved before kickoff; no retrospective selection',...summarize(rows),byMarket:Object.fromEntries(['Moneyline','Spread','Total'].map(m=>[m,summarize(rows.filter(r=>r.market===m))]))};
}
export function propEvaluation(data){
  const candidates=(data?.picks||[]).filter(p=>['win','loss','push'].includes(p.status)&&p.capturedAt&&new Date(p.capturedAt)<new Date(p.commenceTime));
  const unique=new Map();for(const pick of candidates){const key=`${pick.eventId}|${pick.player}|${pick.market}`;const old=unique.get(key);if(!old||Number(pick.policyVersion||0)>Number(old.policyVersion||0))unique.set(key,pick);}
  const verified=[...unique.values()];
  const toRow=p=>({win:p.status==='win',push:p.status==='push',prob:numeric(p.hitProbability)==null?null:p.hitProbability/100,profit:/prizepicks|underdog/i.test(p.provider||'')?null:profit(numeric(p.price),p.status==='win',p.status==='push'),marketProb:numeric(p.marketProbability)==null?null:p.marketProbability/100});
  const qualified=verified.filter(p=>p.policyVersion&&p.betEligible===true);
  const categories=[...new Set(verified.map(p=>p.market))];
  return {allTracked:summarize(verified.map(toRow)),qualified:summarize(qualified.map(toRow)),byMarket:Object.fromEntries(categories.map(m=>[m,summarize(verified.filter(p=>p.market===m).map(toRow))])),legacyPicks:verified.filter(p=>!p.policyVersion).length,note:'Legacy tracked props are not presented as qualified bets. DFS entries need actual entry payouts to calculate ROI.'};
}
export function filterReview(games,events,props,now=Date.now()){
  const upcoming=games.filter(g=>new Date(g.date)>now&&new Date(g.date)-now<=7*86400000),rows=upcoming.flatMap(g=>gameRows(g,events,now)),propRows=(props?.props||[]).filter(p=>new Date(p.commenceTime)>now&&new Date(p.commenceTime)-now<=7*86400000).map(p=>propRow(p,now));
  const review=items=>({evaluated:items.length,qualified:items.filter(r=>r.units>0).length,blockedByData:items.filter(r=>r.blockers.length).length,belowBettingThresholds:items.filter(r=>!r.blockers.length&&!r.units).length,reasons:Object.fromEntries([...new Set(items.filter(r=>!r.units).flatMap(r=>r.blockers.length?r.blockers:[r.reason]))].map(reason=>[reason,items.filter(r=>!r.units&&(r.blockers.includes(reason)||r.reason===reason)).length]))});
  return {games:review(rows),props:review(propRows),policy:'One policy for game details, Top 10, and saved qualified plays. Edge is measured against the offered price, not a synthetic no-vig price.'};
}
