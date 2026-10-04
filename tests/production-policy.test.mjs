import test from 'node:test';
import assert from 'node:assert/strict';
import {gameRows,propRow} from '../scripts/betting-policy.mjs';
import {gameEvaluation,propEvaluation,latestForecasts} from '../scripts/production-evaluation.mjs';
import {fitChronological,fitResidualCorrection} from '../scripts/calibration-fit.mjs';
import {propProbability} from '../scripts/prop-statistics.mjs';
import {promotionGate} from '../scripts/promotion-gate.mjs';
import {consensusPoint} from '../scripts/market-quotes.mjs';
const now=new Date('2026-10-03T02:00Z').getTime();
const game={id:'1',home:'Home',away:'Away',date:'2026-10-04T17:00Z',prediction:{version:1,asOf:'2026-10-03T01:55Z',marketMargin:3,marketTotal:45,spread:-8,total:45,spreadEdge:5,homeCover:63,homeWin:65,confidenceByMarket:{spread:'High',moneyline:'High'},dataQuality:{eligible:true}}};
const events=[{home_team:'Home',away_team:'Away',oddsFetchedAt:'2026-10-03T01:55Z',freshBookmakers:['a','b','c','d'],bookmakers:['a','b','c','d'].map(key=>({key,title:key,markets:[{key:'spreads',outcomes:[{name:'Home',point:-3,price:-110},{name:'Away',point:3,price:-110}]}]}))}];
test('canonical policy requires real quotes at the exact modeled line and actual price value',()=>{
 const row=gameRows(game,events,now).find(r=>r.type==='Spread');assert.equal(row.units,3);assert.ok(row.valueEdge>10);
 const moved=structuredClone(events);for(const b of moved[0].bookmakers)b.markets[0].outcomes[0].point=-3.5;
 assert.equal(gameRows(game,moved,now).find(r=>r.type==='Spread').units,0);
 const expensive=structuredClone(events);for(const b of expensive[0].bookmakers)b.markets[0].outcomes[0].price=-200;
 assert.equal(gameRows(game,expensive,now).find(r=>r.type==='Spread').units,0);
});
test('blocked injuries, stale forecasts and started games cannot produce bets',()=>{
 const blocked=structuredClone(game);blocked.prediction.dataQuality={eligible:false,reasons:['Injury report is stale']};assert.ok(gameRows(blocked,events,now).every(r=>r.units===0));
 assert.ok(gameRows(game,events,now+3*3600000).every(r=>r.units===0));assert.ok(gameRows(game,events,new Date(game.date).getTime()).every(r=>r.units===0));
});
test('synthetic DFS prices do not establish sportsbook EV',()=>{
 const p={player:'Player',marketLabel:'Yards',pick:'Over',line:50,price:-110,provider:'PrizePicks',providerKey:'prizepicks',hitProbability:75,modelSample:8,projectionType:'hybrid',capturedAt:'2026-10-03T01:55Z',commenceTime:game.date,dataQuality:{eligible:true}};
 assert.equal(propRow(p,now).units,0);assert.equal(propRow(p,now).valueEdge,null);
 assert.equal(propRow({...p,provider:'Book',providerKey:'book'},now).units,3);
});
test('audit grades a recorded side-specific price and excludes mismatched-line probability comparisons',()=>{
 const g=structuredClone(game);g.status='Final';g.statusCompleted=true;g.homeScore=24;g.awayScore=20;g.prediction.market={capturedAt:g.prediction.asOf,homePoint:-3.5,total:45,prices:{homeSpread:-120,awaySpread:100,over:-110,under:-110,homeMoneyline:-150,awayMoneyline:130}};
 const result=gameEvaluation([g],[],'nfl');assert.equal(result.byMarket.spread.wins,1);assert.equal(result.byMarket.spread.profitUnits,.8333);assert.equal(result.byMarket.spread.marketComparisonSamples,0);assert.equal(result.excluded.unalignedSpread,1);
 const post=structuredClone(g);post.prediction.asOf='2026-10-05T00:00Z';assert.equal(gameEvaluation([post],[],'nfl').overall.plays,0);
});
test('archive comparisons count one latest pregame forecast per game',()=>{
 const entries=[{league:'nfl',id:'1',prediction:{...game.prediction,asOf:'2026-10-02T00:00Z'}},{league:'nfl',id:'1',prediction:game.prediction}];
 assert.equal(latestForecasts([game],entries,'nfl').length,1);
});
test('legacy prop tracking cannot be relabeled qualified betting performance',()=>{
 const p={status:'win',capturedAt:'2026-10-01',commenceTime:'2026-10-04',price:-110,hitProbability:60,provider:'Book',market:'yards'};
 const result=propEvaluation({picks:[p,{...p,policyVersion:1,betEligible:true}]});assert.equal(result.allTracked.plays,1);assert.equal(result.qualified.plays,1);assert.equal(result.legacyPicks,0);
});
test('calibration cannot fit small samples or promote a factor that fails later results',()=>{
 assert.equal(fitChronological(Array.from({length:30},(_,i)=>({date:i,prob:.9,outcome:i%2}))).factor,1);
 const rows=Array.from({length:100},(_,i)=>({date:i,prob:.8,outcome:i<70?i%2:1}));const result=fitChronological(rows);assert.equal(result.factor,1);assert.equal(result.status,'held-out-no-improvement');assert.equal(result.holdoutSamples,30);
});
test('props include small-sample uncertainty and discrete probability mass',()=>{
 const r=propProbability({market:'player_reception_yds',pick:'Over',line:29.5,values:[41,40,42],projection:50,floor:14});assert.ok(r.probability<.92);assert.ok(r.effectiveSample<3);
 const count=propProbability({market:'player_pass_tds',pick:'Over',line:1,values:[1,2,1,3,2],projection:1.8,floor:.65});assert.ok(count.pushProbability>0);assert.ok(count.probability>0&&count.probability<1);
});
test('promotion requires enough independent weeks and demonstrated improvement',()=>{
 assert.equal(promotionGate([{candidate:1,baseline:10,date:'2026-10-01'}]).promote,false);
 const rows=Array.from({length:120},(_,i)=>({candidate:8,baseline:10,date:new Date(Date.UTC(2026,0,1)+Math.floor(i/15)*7*86400000).toISOString()}));assert.equal(promotionGate(rows).promote,true);
 assert.ok([-3,-3.5].includes(consensusPoint([-3,-3.5])));
});

test('score bias corrections require improvement on later games',()=>{
 const samples=Array.from({length:100},(_,i)=>({date:i,residual:i<70?8:0}));
 assert.equal(fitResidualCorrection(samples).correction,0);
 assert.equal(fitResidualCorrection(samples.slice(0,20)).correction,0);
});

test('total diagnostics distinguish unders, overs and signed scoring bias',()=>{
 const g=structuredClone(game);g.status='Final';g.homeScore=30;g.awayScore=24;
 g.prediction.total=44;g.prediction.overProb=48;
 g.prediction.market={capturedAt:g.prediction.asOf,total:45,prices:{over:-110,under:-110}};
 const result=gameEvaluation([g],[],'nfl');
 assert.equal(result.totalBySide.Under.losses,1);
 assert.equal(result.totalBySide.Over.plays,0);
 assert.equal(result.errors.total.meanActualMinusModel,10);
});
