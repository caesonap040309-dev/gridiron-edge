import {promotionGate} from "./promotion-gate.mjs";
import {gameRows} from "./betting-policy.mjs";
import {mkdir,readFile,writeFile,realpath} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {numeric,fitRatings,buildContextLookup,contextAdjustment,sustainablePoints} from "./model-context.mjs";
import {rosterGameWeights} from "./team-performance.mjs";
const round=v=>v==null?null:Math.round(v*10000)/10000;
const mean=rows=>rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:null;
export const validPregame=(p,game)=> {
  if(!p?.asOf||!game.date)return false;
  const asOf=new Date(p.asOf),kickoff=new Date(game.date);
  return Number.isFinite(asOf.getTime())&&Number.isFinite(kickoff.getTime())&&asOf<kickoff;
};
const profit=(price,win,push=false)=>push?0:win?(price<0?100/(-price):price/100):-1;
export function evaluateSnapshots(entries,games){
  const actual=new Map(games.map(g=>[String(g.id),g])),pairs=[],markets={spread:[],total:[],moneyline:[]};
  const latest=new Map();for(const entry of entries){const old=latest.get(String(entry.id));if(!old||new Date(entry.prediction?.asOf)>new Date(old.prediction?.asOf))latest.set(String(entry.id),entry);}
  for(const entry of latest.values()){
    const game=actual.get(String(entry.id)),p=entry.prediction,b=p?.baseline;
    if(!game||!(game.statusCompleted||/final/i.test(game.status||""))||!validPregame(p,game)||!b)continue;
    const home=numeric(game.homeScore),away=numeric(game.awayScore);
    if(home==null||away==null)continue;
    const outcome=home>away?1:0;
    const margin=home-away,total=home+away;
    pairs.push({date:game.date,version:p.version,baselineVersion:b.version,
      marginError:numeric(p.spread)==null?null:Math.abs(-p.spread-margin),
      baselineMarginError:numeric(b.spread)==null?null:Math.abs(-b.spread-margin),
      totalError:numeric(p.total)==null?null:Math.abs(p.total-total),
      baselineTotalError:numeric(b.total)==null?null:Math.abs(b.total-total),
      brier:home===away||numeric(p.homeWin)==null?null:(p.homeWin/100-outcome)**2,
      baselineBrier:home===away||numeric(b.homeWin)==null?null:(b.homeWin/100-outcome)**2});
    const quote=p.market,quotedAt=new Date(quote?.capturedAt);
    if(!Number.isFinite(quotedAt.getTime())||quotedAt>=new Date(game.date))continue;
    const point=numeric(quote?.homePoint),line=numeric(quote?.total);
    const closing=game.prediction?.closingConsensus,closedAt=new Date(closing?.capturedAt);
    const usableClose=Number.isFinite(closedAt.getTime())&&closedAt>=quotedAt&&closedAt<new Date(game.date);
    if(point!=null&&numeric(p.spread)!=null){
      const homePick=-p.spread+point>=0,push=margin+point===0,win=homePick?(margin+point>0):(margin+point<0);
      const price=numeric(quote.prices?.[homePick?"homeSpread":"awaySpread"]);
      const closingPoint=usableClose?numeric(closing.homePoint):null;
      markets.spread.push({win,push,profit:price==null||price===0?null:profit(price,win,push),clv:closingPoint==null?null:homePick?point-closingPoint:closingPoint-point});
    }
    if(line!=null&&numeric(p.total)!=null){
      const over=p.total>=line,push=total===line,win=over?total>line:total<line;
      const price=numeric(quote.prices?.[over?"over":"under"]),closingTotal=usableClose?numeric(closing.total):null;
      markets.total.push({win,push,profit:price==null||price===0?null:profit(price,win,push),clv:closingTotal==null?null:over?closingTotal-line:line-closingTotal});
    }
    if(home!==away&&numeric(p.homeWin)!=null){
      const homePick=p.homeWin>=50,win=homePick===(home>away),price=numeric(quote.prices?.[homePick?"homeMoneyline":"awayMoneyline"]);
      markets.moneyline.push({win,push:false,profit:price==null||price===0?null:profit(price,win),clv:null});
    }
  }
  const summarize=rows=>{const decided=rows.filter(r=>!r.push),priced=rows.filter(r=>r.profit!=null),clv=rows.filter(r=>r.clv!=null);
    return {forecasts:rows.length,wins:decided.filter(r=>r.win).length,losses:decided.filter(r=>!r.win).length,pushes:rows.length-decided.length,
      winRate:round(decided.length?decided.filter(r=>r.win).length/decided.length:null),pricedForecasts:priced.length,profitUnits:round(priced.reduce((a,r)=>a+r.profit,0)),roi:round(mean(priced.map(r=>r.profit))),closingLineSamples:clv.length,meanClosingLineValuePoints:round(mean(clv.map(r=>r.clv)))}};
  const metrics=rows=>Object.fromEntries(["marginError","baselineMarginError","totalError","baselineTotalError","brier","baselineBrier"].map(k=>[k,round(mean(rows.map(r=>r[k]).filter(v=>v!=null)))]));
  return {promotion:{spread:promotionGate(pairs.map(r=>({date:r.date,candidate:r.marginError,baseline:r.baselineMarginError}))),total:promotionGate(pairs.map(r=>({date:r.date,candidate:r.totalError,baseline:r.baselineTotalError})))},status:pairs.length?"collecting forward evidence":"awaiting completed paired pregame forecasts",pairedGames:pairs.length,...metrics(pairs),
    byVersion:Object.fromEntries([...new Set(pairs.map(r=>r.version))].map(v=>[v,{games:pairs.filter(r=>r.version===v).length,...metrics(pairs.filter(r=>r.version===v))}])),
    byMarket:Object.fromEntries(Object.entries(markets).map(([k,v])=>[k,summarize(v)])),
    note:"All paired forecasts, not a selected betting card. Profit uses recorded side-specific prices only. Missing prices and closing lines are excluded."};
}

export function walkForward(games,league){
  const completed=games.filter(g=>(g.statusCompleted||/final/i.test(g.status||""))&&numeric(g.homeScore)!=null&&numeric(g.awayScore)!=null).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const rosterWeight=rosterGameWeights(completed),contextFor=buildContextLookup(completed);
  const errors=[];
  for(const game of completed.slice(-150)){
    const before=new Date(game.date),prior=completed.filter(g=>new Date(g.date)<before);
    const records=new Map(),add=(name,r)=>{if(!records.has(name))records.set(name,[]);records.get(name).push(r)};
    for(const g of prior)for(const side of ["home","away"]){
      const other=side==="home"?"away":"home";
      const weight=Math.max(.28,Math.exp(-Math.max(0,(before-new Date(g.date))/86400000)/70))*Math.pow(.45,Math.max(0,Number(game.season)-Number(g.season)));
      add(g[side],{opponent:g[other],scored:Number(g[side+"Score"]),allowed:Number(g[other+"Score"]),weight,
        offenseWeight:Math.min(rosterWeight(g,side),rosterWeight(g,other,"defense")),defenseWeight:Math.min(rosterWeight(g,side,"defense"),rosterWeight(g,other)),
        sustainableScored:sustainablePoints(g,side),sustainableAllowed:sustainablePoints(g,other)});
    }
    if((records.get(game.home)?.length||0)<2||(records.get(game.away)?.length||0)<2)continue;
    const options={leagueMean:league==="cfb"?27:22.5,priorGames:3.5,blowoutMargin:league==="cfb"?28:Infinity,blowoutDiscount:.62};
    const baseline=fitRatings(records,options),candidate=fitRatings(records,{...options,sustainable:true}),advanced=contextAdjustment(contextFor(game.home,before),contextFor(game.away,before));
    const prediction=(ratings,adjustment)=>{
      const h=ratings.get(game.home),a=ratings.get(game.away),field=game.neutralSite?0:league==="cfb"?2.7:1.8;
      return {margin:h.offense-a.offense+h.defense-a.defense+field+(adjustment?.margin||0),
        total:options.leagueMean*2+h.offense+a.offense-h.defense-a.defense+(adjustment?.total||0)};
    };
    const b=prediction(baseline),p=prediction(candidate,advanced),margin=Number(game.homeScore)-Number(game.awayScore),total=Number(game.homeScore)+Number(game.awayScore);
    errors.push({baselineMargin:Math.abs(b.margin-margin),candidateMargin:Math.abs(p.margin-margin),baselineTotal:Math.abs(b.total-total),candidateTotal:Math.abs(p.total-total)});
  }
  return {method:"Chronological scoring-feature experiment; every game uses strictly earlier results. Excludes sportsbook, weather and live injury adjustments.",
    games:errors.length,baselineMarginMAE:round(mean(errors.map(r=>r.baselineMargin))),candidateMarginMAE:round(mean(errors.map(r=>r.candidateMargin))),
    baselineTotalMAE:round(mean(errors.map(r=>r.baselineTotal))),candidateTotalMAE:round(mean(errors.map(r=>r.candidateTotal))),
    limitation:"Historical feature-development evidence, not an independent betting-profit claim or a full replay of the production forecast."};
}
async function read(path,fallback){try{return JSON.parse(await readFile(path,"utf8"))}catch{return fallback}}
export async function main(){
  const [cfb,nfl,archive]=await Promise.all([read("data/live.json",{games:[]}),read("data/nfl.json",{games:[]}),read("data/model-snapshots.json",{entries:[]})]);
  const now=new Date(),known=new Set(archive.entries.map(e=>e.league+":"+e.id+":"+e.prediction.version+":"+(e.policyVersion||0)));
  for(const [league,data] of [["cfb",cfb],["nfl",nfl]])for(const game of data.games||[]){
    const p=game.prediction,date=new Date(game.date),id=league+":"+game.id+":"+p?.version+":1";
    if(!p?.baseline||!validPregame(p,game)||date<=now||date>new Date(now.getTime()+7*86400000)||known.has(id))continue;
    archive.entries.push({league,id:String(game.id),date:game.date,prediction:p,policyVersion:1,qualifiedPlays:gameRows(game,data.events||[],now.getTime()).filter(row=>row.units>0)});known.add(id);
  }
  const report={updatedAt:now.toISOString(),coefficientStatus:"Live fixed caps; coefficient changes require chronological held-out calibration or sufficient paired forward improvement",
    cfb:{forward:evaluateSnapshots(archive.entries.filter(e=>e.league==="cfb"),cfb.games||[]),historical:walkForward(cfb.games||[],"cfb")},
    nfl:{forward:evaluateSnapshots(archive.entries.filter(e=>e.league==="nfl"),nfl.games||[]),historical:walkForward(nfl.games||[],"nfl")}};
  await mkdir("data",{recursive:true});
  await writeFile("data/model-snapshots.json",JSON.stringify({updatedAt:now.toISOString(),entries:archive.entries},null,2)+"\n");
  await writeFile("data/model-validation.json",JSON.stringify(report,null,2)+"\n");
  console.log("Model validation saved: paired forward snapshots and chronological feature comparison.");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await realpath(process.argv[1])).href)await main();

