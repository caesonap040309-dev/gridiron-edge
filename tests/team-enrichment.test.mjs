import test from "node:test";
import assert from "node:assert/strict";
import {nflCoverage,nflRefreshInterval,parseCSV,aggregateNFL,attachNFLData,enrichmentFor,enrichmentAdjustment,normalizeProfiles,roleFactor,dataQuality,attachCollegeAdvanced,collegeFor,collegeAdjustment} from "../scripts/team-enrichment.mjs";
import {rosterGameWeights} from "../scripts/team-performance.mjs";
test("CSV handles quoted commas, escaped quotes, newlines and missing values",()=>{
 const rows=parseCSV('name,value\n"Player, Jr.",0\n"Two ""Names""",\n');
 assert.equal(rows[0].name,"Player, Jr.");assert.equal(rows[0].value,"0");assert.equal(rows[1].name,'Two "Names"');assert.equal(rows[1].value,"");
});
test("NFL aggregation joins charting to offensive team and excludes kneels",()=>{
 const id="2026_01_A_B";
 const data=aggregateNFL({snaps:[{game_id:id,game_type:"REG",team:"A",player:"Starter",pfr_player_id:"p",offense_pct:"0.9",defense_pct:"0",st_pct:"0"}],
 passing:[{game_id:id,team:"A",times_pressured:"4",times_pressured_pct:"0.2"}],
 rushing:[{game_id:id,team:"A",carries:"10",rushing_yards_before_contact:"30",rushing_yards_after_contact:"20"}],
 charting:[{nflverse_game_id:id,nflverse_play_id:"2",n_blitzers:"2",is_motion:"TRUE"}],
 pbp:[{game_id:id,play_id:"2",posteam:"A",defteam:"B",qb_dropback:"1",epa:"0.4",wp:"0.5"},{game_id:id,play_id:"3",posteam:"A",defteam:"B",rush_attempt:"1",qb_kneel:"1",epa:"8",wp:"0.5"}]});
 assert.equal(data[id].A.pressure.dropbacks,20);assert.equal(data[id].A.contact.before,30);assert.equal(data[id].A.chart.blitzes,1);
 assert.equal(data[id].A.epa.pass.sum,.4);assert.equal(data[id].A.epa.run.n,0);
});
test("snap join uses season, week and explicit team abbreviations",()=>{
 const game={season:2026,week:1,homeAbbreviation:"LAC",awayAbbreviation:"ARI"};
 const row={snaps:[]};attachNFLData([game],{games:{"2026_01_ARI_LAC":{LAC:row}}});assert.equal(game.enrichment.home,row);
});
test("actual defensive snaps discount missing regular defenders without discounting offense",()=>{
 const snaps=(missing=false)=>Array.from({length:11},(_,i)=>({id:"p"+i,name:"Player "+i,offense:1,defense:missing&&i===0?0:1}));
 const games=Array.from({length:3},(_,i)=>({id:String(i),season:2026,date:"2026-09-0"+(i+1),home:"A",away:"B",statusCompleted:true,
 performance:{home:{players:[{id:"q",kind:"passing",usage:20}]}},enrichment:{home:{snaps:snaps(i===2)}}}));
 const w=rosterGameWeights(games);assert.ok(w(games[2],"home","defense")<1);assert.equal(w(games[2],"home"),1);assert.equal(games[2].rosterContext.home.snapEvidence[0].unit,"defense");
});
test("profile role distinguishes a backup and preserves starter value after limited snaps",()=>{
 const profile=normalizeProfiles({season:{year:2026},depthchart:[{name:"3WR 1TE",positions:{qb:{position:{abbreviation:"QB"},athletes:[{id:"1",displayName:"Starter"},{id:"2",displayName:"Backup"}]}}}]},{coach:[{id:"c",firstName:"Coach",lastName:"Name"}]},"2026-09-01");
 assert.equal(roleFactor({athleteId:"2",name:"Backup"},profile,null).factor,.55);
 const starter=roleFactor({athleteId:"1",name:"Starter",position:"QB"},profile,{snaps:[{name:"Starter",offense:.1}]});assert.ok(starter.factor>=.95);
});
test("historical enrichment does not consume a future game's EPA",()=>{
 const row={snaps:[],pressure:{pressures:1,dropbacks:10},contact:{carries:10,before:30,after:20},epa:{run:{sum:1,n:10},pass:{sum:2,n:10}},chart:{blitzes:1,passes:10,blitzEPA:1,blitzPlays:1,motion:1,playAction:1,plays:20},special:{fgMade:1,fgExpected:.8,fgAttempts:1,punts:1,puntNetSum:40,returns:1,returnYards:10}};
 const games=[{season:2026,date:"2026-09-01",home:"A",away:"B",statusCompleted:true,enrichment:{home:row,away:row}},{season:2026,date:"2026-09-10",home:"A",away:"B",statusCompleted:true,enrichment:{home:row,away:row}}];
 const e=enrichmentFor(games,"A","2026-09-05");assert.equal(e.games,1);assert.equal(e.passEPA,.2);assert.equal(e.passEPAAgainstBlitz,null);
 assert.equal(enrichmentFor(games,"A","2026-08-01"),null);assert.equal(enrichmentAdjustment(null,e).margin,0);
});
test("stale quotes cannot be made fresh by a newly written model file",()=>{
 const now=new Date("2026-10-02T21:00:00Z"),game={date:"2026-10-03",injuries:{updatedAt:now.toISOString(),source:"ESPN"},prediction:{contextEvidence:{home:{},away:{}}}};
 const event={oddsFetchedAt:now.toISOString(),freshBookmakers:["draftkings"],bookmakers:[{key:"draftkings",last_update:"2026-10-01T21:00:00Z"}]};
 assert.equal(dataQuality(game,event,now).eligible,false);
 event.bookmakers[0].last_update=now.toISOString();assert.equal(dataQuality(game,event,now).eligible,true);
 assert.equal(dataQuality(game,{freshBookmakers:[],bookmakers:[]},now).eligible,false);
});
test("unknown injury coverage reduces reliability but does not assert players are healthy",()=>{
 const now=new Date("2026-10-02T21:00:00Z"),game={date:"2026-10-03",prediction:{contextEvidence:{home:{},away:{}}}};
 const event={oddsFetchedAt:now.toISOString(),freshBookmakers:["draftkings"],bookmakers:[{key:"draftkings"}]};
 const q=dataQuality(game,event,now);assert.ok(q.warnings.includes("Injury coverage unavailable"));assert.ok(q.reliabilityFactor<1);
});
test("college advanced metrics join by game ID and retain PPA's actual name",()=>{
 const game={id:"1",season:2026,date:"2026-09-01",home:"Northwestern Wildcats",away:"Penn State Nittany Lions",statusCompleted:true};
 attachCollegeAdvanced([game],{rows:[{gameId:1,team:"Northwestern",offense:{ppa:.2,lineYards:3},defense:{ppa:.1,lineYards:2}}]});
 const e=collegeFor([game],game.home,"2026-09-02");assert.equal(e.offensePPA,.2);assert.equal(collegeFor([game],game.home,"2026-08-01"),null);
 assert.equal(collegeAdjustment(e,null).margin,0);
});
test("full snapshots fail safely when future timestamps are reported",()=>{
 const now=new Date("2026-10-02T21:00:00Z");
 const game={date:"2026-10-03",injuries:{updatedAt:"2026-10-01",source:"ESPN"},prediction:{contextEvidence:{home:{},away:{}}}};
 const event={freshBookmakers:["draftkings"],bookmakers:[{key:"draftkings",last_update:"2026-10-04"}]};
 assert.equal(dataQuality(game,event,now).eligible,false);
});

test('healthy NFL feeds retry missing completed games without claiming full coverage',()=>{
 const now=new Date('2026-10-05T18:00Z');
 const game={id:'g',season:2026,week:4,home:'Home',away:'Away',homeAbbreviation:'WSH',awayAbbreviation:'JAC',date:'2026-10-04T17:00Z',statusCompleted:true};
 const data={games:{},sourceHealth:Object.fromEntries(['snaps','passing','rushing','pbp','charting'].map(k=>[k,{status:'available'}]))};
 assert.equal(nflRefreshInterval([game],data,now),30*60000);
 assert.equal(nflCoverage([game],data,now).coveredGames.epa,0);
 const row={snaps:[{}],epa:{run:{n:10},pass:{n:20}},pressure:{known:true},contact:{carries:20},chart:{plays:30}};
 data.games['2026_04_JAX_WAS']={JAX:row,WAS:row};
 assert.equal(nflCoverage([game],data,now).missingGames.length,0);
 assert.equal(nflRefreshInterval([game],data,now),6*3600000);
 assert.equal(nflCoverage([{...game,statusCompleted:false}],data,now).completedGames,0);
 assert.equal(nflRefreshInterval([], {games:{},sourceHealth:{}},now),30*60000);
});
