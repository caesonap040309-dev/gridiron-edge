import test from "node:test";
import assert from "node:assert/strict";
import {extractContext,playerProduction,playCreator,buildContextLookup,contextAdjustment,playerInjuryValue,fitRatings,numeric,sustainablePoints,injuryScoringAdjustment} from "../scripts/model-context.mjs";
import {rosterGameWeights} from "../scripts/team-performance.mjs";
import {evaluateSnapshots,validPregame,walkForward} from "../scripts/validate-model.mjs";
const play=(id,team,kind,yards,down=1,distance=10,homeScore=0,awayScore=0,period=1)=>({id,sequenceNumber:id,start:{team:{id:team},down,distance,yardsToEndzone:60},statYardage:yards,type:{text:kind},homeScore,awayScore,period:{number:period},clock:{displayValue:"10:00"}});
const summary={drives:{previous:[{team:{id:"h"},result:"TD",displayResult:"Touchdown",plays:[play("1","h","Rush",4),play("2","h","Pass Reception",5,2,10),play("3","h","Passing Touchdown",20,3,10,6),play("4","a","Sack",-7,1,10,6)]}]},scoringPlays:[{team:{id:"h"},type:{text:"Interception Return Touchdown"}}],boxscore:{players:[{team:{id:"h"},statistics:[{name:"rushing",labels:["CAR","YDS","TD"],athletes:[{athlete:{id:"rb",displayName:"Great Runner"},stats:["20","120","2"]}]},{name:"passing",labels:["C/ATT","YDS","INT"],athletes:[{athlete:{id:"qb",displayName:"Good Passer"},stats:["20/30","240","1"]}]}]}]}};
const game={id:"g",home:"H",away:"A",homeId:"h",awayId:"a",date:"2026-09-05T20:00:00Z",season:2026,homeScore:30,awayScore:20,statusCompleted:true};
test("success uses down/distance; sacks remain failed dropbacks; missing EPA is null",()=>{
 const c=extractContext(summary,game);assert.equal(c.home.run.success,1);assert.equal(c.home.pass.success,1);
 assert.equal(c.away.sacks,1);assert.equal(c.away.pass.success,0);assert.equal(c.home.nonOffensivePoints,6);
 assert.equal(c.home.coverage.epa,"unavailable");assert.equal(numeric(null),null);
});
test("real ESPN CAR and passing splits yield workload; creator parsing is unambiguous",()=>{
 const p=playerProduction(summary,"h");assert.equal(p.find(p=>p.kind==="rushing").usage,20);assert.equal(p.find(p=>p.kind==="passing").usage,30);
 assert.equal(playCreator({text:"G.Runner left tackle for 10 yards"},p,"run").id,"rb");
});
test("garbage-time, kneels and spikes do not count as normal efficiency",()=>{
 const s=structuredClone(summary);s.drives.previous[0].plays.push(play("5","h","End Period",0,0,0,40,0,4),play("6","h","Rush",10,1,10,40,0,4));
 s.drives.previous[0].plays[0].text="Quarterback kneels";const c=extractContext(s,game);assert.equal(c.home.run.plays,0);assert.ok(c.home.garbagePlays>=1);
});
test("historical lookups ignore future games and require independent evidence",()=>{
 const past={...game,date:"2026-09-01",performance:{home:{context:extractContext(summary,game).home},away:{context:extractContext(summary,game).away}}};
 const future={...past,id:"future",date:"2026-09-20"};
 assert.equal(buildContextLookup([past,future])("H",new Date("2026-09-02")).games,1);
 assert.equal(buildContextLookup([past])("H",new Date("2026-08-01")),null);
 assert.deepEqual(contextAdjustment(null,null).components,{});
});
test("defensive absences need fresh pregame evidence; units are independent",()=>{
 const absent={...game,injuries:{updatedAt:"2026-09-05T18:00:00Z",source:"ESPN",home:[{name:"Corner",position:"CB",status:"Out",expectedLoss:.95}],away:[]}};
 const after={...absent,id:"late",injuries:{...absent.injuries,updatedAt:"2026-09-06"}};
 const w=rosterGameWeights([absent,after]);assert.ok(w(absent,"home","defense")<1);assert.equal(w(absent,"home"),1);assert.equal(w(after,"home","defense"),1);
});
test("current injury valuation uses role and observed backup without future logs",()=>{
 const rows=Array.from({length:3},(_,i)=>({...game,id:String(i),date:"2026-09-0"+(i+1),performance:{home:{players:[
 {id:"qb",name:"Starter",kind:"passing",usage:30,usageKnown:true,yards:240},{id:"backup",name:"Backup",kind:"passing",usage:5,usageKnown:true,yards:20}]}}}));
 const item={athleteId:"qb",name:"Starter",position:"QB",expectedLoss:5.5};
 const value=playerInjuryValue(rows,game,"home",item);assert.equal(value.replacementQuality.id,"backup");assert.equal(value.historyGames,3);
 assert.equal(playerInjuryValue([],game,"home",item).expectedLoss,5.5);
});
test("anomalous scoring is regressed without changing actual final score",()=>{
 const g={...game,performance:{home:{context:extractContext(summary,game).home}}};
 assert.ok(sustainablePoints(g,"home")<30);assert.equal(g.homeScore,30);
});
test("defense absences reduce opponent offense credit, with separate rating denominators",()=>{
 const records=new Map([["H",[{opponent:"A",scored:40,allowed:20,weight:1,offenseWeight:.4,defenseWeight:1}]],["A",[{opponent:"H",scored:20,allowed:40,weight:1,offenseWeight:1,defenseWeight:.4}]]]);
 const ratings=fitRatings(records,{leagueMean:27,priorGames:3.5});assert.ok(Number.isFinite(ratings.get("H").offense));
 const full=fitRatings(new Map([...records].map(([k,r])=>[k,r.map(x=>({...x,offenseWeight:1,defenseWeight:1}))])),{leagueMean:27,priorGames:3.5});
 assert.ok(ratings.get("H").offense<full.get("H").offense);
});
test("paired validation rejects postgame timestamps and missing prices",()=>{
 const prediction={version:12,asOf:"2026-09-05T18:00:00Z",homeWin:60,spread:-5,total:48,baseline:{version:11,homeWin:55,spread:-3,total:45},market:{capturedAt:"2026-09-05T18:00:00Z",homePoint:-3,total:48,prices:{homeSpread:-110,over:-110}}};
 const report=evaluateSnapshots([{id:"g",prediction}],[game]);assert.equal(report.pairedGames,1);assert.equal(report.byMarket.spread.pricedForecasts,1);
 assert.equal(report.byMarket.moneyline.pricedForecasts,0);assert.ok(report.byMarket.spread.profitUnits>0);
 assert.equal(validPregame({...prediction,asOf:"2026-09-06"},game),false);
 assert.equal(validPregame({...prediction,asOf:null},game),false);
});
test("walk-forward does not treat future or first-game outcomes as training evidence",()=>{
 const rows=Array.from({length:5},(_,i)=>({...game,id:String(i),date:"2026-09-0"+(i+1),homeScore:20+i,awayScore:18}));
 const first=walkForward(rows.slice(0,2),"cfb");assert.equal(first.games,0);
 const all=walkForward(rows,"cfb");assert.equal(all.games,3);assert.ok(Number.isFinite(all.candidateMarginMAE));
});

 test("injury scoring separates offensive losses from weakened defenses",()=>{
   const qb={position:'QB',expectedLoss:5},cb={position:'CB',expectedLoss:1};
   assert.equal(injuryScoringAdjustment([qb],[]).total,-.8);
   assert.equal(injuryScoringAdjustment([cb],[]).total,.16);
   assert.equal(injuryScoringAdjustment([],[cb]).total,.16);
   assert.equal(injuryScoringAdjustment([qb,cb],[]).margin,-6);
   assert.equal(injuryScoringAdjustment([{position:'unknown',expectedLoss:2}],[]).total,0);
   assert.equal(injuryScoringAdjustment([],[]).total,0);
   assert.ok(Math.abs(injuryScoringAdjustment(Array(30).fill(qb),Array(30).fill(qb)).total)<=2.5);
 });
