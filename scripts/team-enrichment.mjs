import {readFile,writeFile,mkdir} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {numeric} from "./model-context.mjs";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const identity=v=>String(v||"").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?$/g,"").replace(/[^a-z0-9]/g,"");
const code=v=>({WSH:"WAS",JAC:"JAX",LA:"LAR"}[String(v).toUpperCase()]||String(v||"").toUpperCase());
export function parseCSV(text){
  const rows=[];let row=[],field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(!quoted&&(c===","||c==="\n")){row.push(field.replace(/\r$/,""));field="";if(c==="\n"){rows.push(row);row=[]}}
    else field+=c;
  }
  if(field||row.length){row.push(field.replace(/\r$/,""));rows.push(row)}
  const headers=rows.shift()||[];
  return rows.filter(r=>r.length===headers.length).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error("feed "+r.status);return r.json()}
async function csv(url){const r=await fetch(url,{signal:AbortSignal.timeout(40000)});if(!r.ok)throw Error("feed "+r.status);const b=Buffer.from(await r.arrayBuffer());return parseCSV(url.endsWith(".gz")?gunzipSync(b).toString():b.toString())}
async function read(path,fallback){try{return JSON.parse(await readFile(path,"utf8"))}catch{return fallback}}
const complete=g=>g.statusCompleted||/final/i.test(g.status||"");
const bool=v=>v==="TRUE"||v==="true"||v==="1";
export function normalizeProfiles(depth,roster,asOf){
  const all=(roster?.athletes||[]).flatMap(group=>group.items||[]);
  const charts=depth?.depthchart||[],starters=[];
  for(const chart of charts)for(const [slot,value] of Object.entries(chart.positions||{})){
    const athlete=value.athletes?.[0];if(!athlete?.id)continue;
    const position=value.position?.parent?.abbreviation||value.position?.abbreviation||slot.toUpperCase();
    if(!starters.some(p=>p.id===String(athlete.id)&&p.position===position))starters.push({id:String(athlete.id),name:athlete.displayName,position,slot,
      replacements:(value.athletes||[]).slice(1,4).map(p=>({id:String(p.id),name:p.displayName}))});
  }
  return {asOf,season:Number(depth?.season?.year||roster?.season?.year),coach:(Array.isArray(roster?.coach)?roster.coach:[]).map(c=>({id:String(c.id),name:[c.firstName,c.lastName].filter(Boolean).join(" ")})),
    schemes:charts.map(c=>c.name),starters,rosterIds:all.map(a=>String(a.id)),coverage:{depthChart:starters.length?"available":"unavailable",routes:"unavailable",manZone:"unavailable"}};
}
export function aggregateNFL(datasets){
  const games={};
  const team=(gameId,teamCode)=>{if(!games[gameId])games[gameId]={};const key=code(teamCode);return games[gameId][key]||(games[gameId][key]={snaps:[],pressure:{pressures:0,dropbacks:0,known:false,pbpDropbacks:0},contact:{carries:0,before:0,after:0},epa:{run:{sum:0,n:0},pass:{sum:0,n:0}},chart:{passes:0,blitzes:0,blitzEPA:0,blitzPlays:0,motion:0,playAction:0,plays:0},special:{fgMade:0,fgExpected:0,fgAttempts:0,punts:0,puntNetSum:0,returns:0,returnYards:0}})};
  for(const r of datasets.snaps||[]){
    if(r.game_type!=="REG")continue;
    team(r.game_id,r.team).snaps.push({id:r.pfr_player_id,name:r.player,position:r.position,offense:numeric(r.offense_pct),defense:numeric(r.defense_pct),special:numeric(r.st_pct),
      offenseSnaps:numeric(r.offense_snaps),defenseSnaps:numeric(r.defense_snaps)});
  }
  for(const r of datasets.passing||[]){
    const pressures=numeric(r.times_pressured),pct=numeric(r.times_pressured_pct);
    if(pressures==null)continue;
    const t=team(r.game_id,r.team);t.pressure.known=true;t.pressure.pressures+=pressures;if(pct>0)t.pressure.dropbacks+=pressures/pct;
  }
  for(const r of datasets.rushing||[]){
    const carries=numeric(r.carries),before=numeric(r.rushing_yards_before_contact),after=numeric(r.rushing_yards_after_contact);
    if(!carries||before==null||after==null)continue;
    const t=team(r.game_id,r.team);t.contact.carries+=carries;t.contact.before+=before;t.contact.after+=after;
  }
  const chartRows=new Map((datasets.charting||[]).map(r=>[r.nflverse_game_id+":"+Number(r.nflverse_play_id),r]));
  for(const r of datasets.pbp||[]){
    if(!r.posteam||!r.defteam)continue;
    const t=team(r.game_id,r.posteam),epa=numeric(r.epa);
    const eligible=!bool(r.qb_kneel)&&!bool(r.qb_spike)&&r.play_type!=="no_play";
    if(bool(r.qb_dropback))t.pressure.pbpDropbacks++;
    const kind=bool(r.qb_dropback)?"pass":bool(r.rush_attempt)?"run":null;
    const wp=numeric(r.wp),competitive=wp==null||(wp>=.05&&wp<=.95);
    if(eligible&&kind&&epa!=null&&competitive){t.epa[kind].sum+=epa;t.epa[kind].n++}
    const chart=chartRows.get(r.game_id+":"+Number(r.play_id));
    if(chart&&eligible&&kind&&competitive){
      t.chart.plays++;if(bool(chart.is_motion))t.chart.motion++;if(bool(chart.is_play_action))t.chart.playAction++;
      if(kind==="pass"){t.chart.passes++;if(numeric(chart.n_blitzers)>0){t.chart.blitzes++;if(epa!=null){t.chart.blitzEPA+=epa;t.chart.blitzPlays++}}}
    }
    if(bool(r.field_goal_attempt)){
      const expected=numeric(r.fg_prob);
      if(expected!=null){t.special.fgAttempts++;t.special.fgExpected+=expected;if(r.field_goal_result==="made")t.special.fgMade++}
    }
    if(bool(r.punt_attempt)&&numeric(r.kick_distance)!=null){t.special.punts++;t.special.puntNetSum+=numeric(r.kick_distance)-(numeric(r.return_yards)||0)-(bool(r.touchback)?20:0)}
    if((bool(r.kickoff_attempt)||bool(r.punt_attempt))&&numeric(r.return_yards)!=null){
      const returnTeam=team(r.game_id,r.defteam);returnTeam.special.returns++;returnTeam.special.returnYards+=numeric(r.return_yards);
    }
  }
  for(const teams of Object.values(games))for(const t of Object.values(teams))if(t.pressure.known&&!t.pressure.dropbacks)t.pressure.dropbacks=t.pressure.pbpDropbacks;
  return games;
}
function nflGameIndex(data){
  const result={};
  for(const [id,teams] of Object.entries(data.games||{})){
    const parts=id.split('_');
    if(parts.length===4){parts[2]=code(parts[2]);parts[3]=code(parts[3]);}
    const key=parts.join('_');result[key]={...result[key],...teams};
  }
  return result;
}
export function nflCoverage(games,data,now=new Date()){
  const indexed=nflGameIndex(data);
  const completed=games.filter(g=>complete(g)),fields={snaps:r=>!!r?.snaps?.length,epa:r=>(r?.epa?.run?.n||0)+(r?.epa?.pass?.n||0)>0,pressure:r=>r?.pressure?.known===true,contact:r=>(r?.contact?.carries||0)>0,charting:r=>(r?.chart?.plays||0)>0};
  const missing=[];const counts=Object.fromEntries(Object.keys(fields).map(k=>[k,0]));
  for(const game of completed){
    const id=[game.season,String(game.week).padStart(2,'0'),code(game.awayAbbreviation),code(game.homeAbbreviation)].join('_');
    const rows=['home','away'].map(side=>indexed[id]?.[code(game[side+'Abbreviation'])]);
    const gaps=Object.entries(fields).filter(([field,has])=>{const present=rows.every(has);if(present)counts[field]++;return !present;}).map(([field])=>field);
    if(gaps.length)missing.push({id:String(game.id),game:game.away+' at '+game.home,date:game.date,fields:gaps,retryDue:now-new Date(game.date)>=6*3600000});
  }
  return {completedGames:completed.length,coveredGames:counts,missingGames:missing,sourceHealth:data.sourceHealth||{},asOf:now.toISOString()};
}
export function nflRefreshInterval(games,data,now=new Date()){
  const sources=['snaps','passing','rushing','pbp','charting'];
  const healthy=sources.every(name=>data.sourceHealth?.[name]?.status==='available');
  const gaps=nflCoverage(games,data,now).missingGames.some(g=>g.retryDue);
  return healthy&&!gaps?6*3600000:30*60000;
}
export async function loadNFLData(season,now=new Date(),games=[]){
  const path="data/nfl-enrichment.json",cached=await read(path,{games:{},sourceHealth:{}});
  if(process.env.REFRESH_TEAM_STATS!=='1'&&cached.season===season&&now-new Date(cached.updatedAt)<nflRefreshInterval(games,cached,now))return cached;
  const base="https://github.com/nflverse/nflverse-data/releases/download/";
  const sources={snaps:"snap_counts/snap_counts_"+season+".csv",passing:"pfr_advstats/advstats_week_pass_"+season+".csv",rushing:"pfr_advstats/advstats_week_rush_"+season+".csv",
    charting:"ftn_charting/ftn_charting_"+season+".csv",pbp:"pbp/play_by_play_"+season+".csv.gz"};
  const data={},health={};
  await Promise.all(Object.entries(sources).map(async([name,path])=>{try{data[name]=await csv(base+path);health[name]={status:"available",rows:data[name].length,fetchedAt:now.toISOString()}}catch{health[name]={status:"unavailable",fetchedAt:now.toISOString()}}}));
  const fresh=aggregateNFL(data),merged={...cached.games};
  for(const [id,teams] of Object.entries(fresh)){
    merged[id]||={};
    for(const [name,row] of Object.entries(teams)){
      const old=merged[id][name];if(old){
        if(!health.snaps?.rows)row.snaps=old.snaps;
        if(!health.passing?.rows)row.pressure=old.pressure;
        if(!health.rushing?.rows)row.contact=old.contact;
        if(!health.pbp?.rows){row.epa=old.epa;row.special=old.special}
        if(!health.charting?.rows||!health.pbp?.rows)row.chart=old.chart;
      }
      merged[id][name]=row;
    }
  }
  const result={season,updatedAt:now.toISOString(),games:merged,sourceHealth:health,
    attribution:"NFL EPA: nflfastR via nflverse. Snap counts and advanced stats: Pro Football Reference via nflverse. Charting: FTN Data via nflverse (CC-BY-SA 4.0).",
    license:"https://creativecommons.org/licenses/by-sa/4.0/"};
  await mkdir("data",{recursive:true});await writeFile(path,JSON.stringify(result)+"\n");return result;
}
export function attachNFLData(games,data){
  const indexed=nflGameIndex(data);
  for(const game of games){
    const id=[game.season,String(game.week).padStart(2,"0"),code(game.awayAbbreviation),code(game.homeAbbreviation)].join("_");
    for(const side of ["home","away"]){
      const row=indexed[id]?.[code(game[side+"Abbreviation"])];
      if(!row)continue;
      if(!game.enrichment)game.enrichment={};game.enrichment[side]=row;
    }
  }
}
export async function loadTeamProfiles(games,sport,now=new Date()){
  const league=sport==="nfl"?"nfl":"cfb",path="data/team-profiles-"+league+".json",cached=await read(path,{teams:{}});
  const needed=new Map();
  for(const g of games)if(!complete(g)&&new Date(g.date)>=now&&new Date(g.date)-now<=8*86400000)for(const side of ["home","away"])if(g[side+"Id"])needed.set(g[side],g[side+"Id"]);
  const entries=[...needed];let cursor=0;
  await Promise.all(Array.from({length:Math.min(6,entries.length)},async()=>{
    while(cursor<entries.length){
      const [name,id]=entries[cursor++],history=cached.teams[name]||[],last=history.at(-1);
      if(last&&now-new Date(last.asOf)<6*3600000)continue;
      const base="https://site.api.espn.com/apis/site/v2/sports/football/"+sport+"/teams/"+encodeURIComponent(id);
      const responses=await Promise.allSettled([json(base+"/depthcharts"),json(base+"/roster")]);
      const depth=responses[0].status==="fulfilled"?responses[0].value:null,roster=responses[1].status==="fulfilled"?responses[1].value:null;
      if(!depth&&!roster)continue;
      const profile=normalizeProfiles(depth,roster,now.toISOString());
      if(!profile.starters.length&&last?.starters?.length){profile.starters=last.starters;profile.coverage.depthChart="cached";profile.depthAsOf=last.depthAsOf||last.asOf}
      history.push(profile);cached.teams[name]=history.slice(-12);
    }
  }));
  cached.updatedAt=now.toISOString();await mkdir("data",{recursive:true});await writeFile(path,JSON.stringify(cached)+"\n");
  const profileFor=(name,before)=>(cached.teams[name]||[]).filter(p=>new Date(p.asOf)<=new Date(before)).at(-1)||null;
  return {profileFor,eraWeight(name,resultDate,before){
    const prior=(cached.teams[name]||[]).filter(p=>new Date(p.asOf)<=new Date(before));
    const current=prior.at(-1),older=prior.at(-2);if(!current||!older)return 1;
    const changed=JSON.stringify(current.coach.map(p=>p.id))!==JSON.stringify(older.coach.map(p=>p.id));
    const oldStarters=new Set(older.starters.map(p=>p.id)),currentStarters=current.starters.map(p=>p.id);
    const continuity=currentStarters.length&&oldStarters.size?currentStarters.filter(id=>oldStarters.has(id)).length/currentStarters.length:null;
    const schemeChanged=JSON.stringify(current.schemes)!==JSON.stringify(older.schemes);
    if(new Date(resultDate)>=new Date(current.asOf))return 1;
    if(changed)return .7;
    return schemeChanged||(continuity!=null&&continuity<.65)?.85:1;
  }};
}
export function enrichmentFor(games,name,before){
  const date=new Date(before),rows=games.filter(g=>complete(g)&&new Date(g.date)<date&&Number(g.season)===date.getUTCFullYear()&&(g.home===name||g.away===name)).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  const valid=rows.filter(g=>g.enrichment?.[g.home===name?"home":"away"]);if(!valid.length)return null;
  const sum=(fn)=>valid.reduce((sum,g)=>{const s=g.home===name?"home":"away";return sum+fn(g.enrichment[s],g.enrichment[s==="home"?"away":"home"],g)},0);
  const ratio=(fn,den)=>{const d=sum(den);return d>0?sum(fn)/d:null};
  const latest=valid[0],side=latest.home===name?"home":"away";
  return {games:valid.length,lastGameDate:latest.date,snaps:latest.enrichment[side].snaps,
    pressureAllowed:ratio(t=>t.pressure.pressures,t=>t.pressure.dropbacks),
    pressureGenerated:ratio((t,o)=>o?.pressure.pressures||0,(t,o)=>o?.pressure.dropbacks||0),
    yardsBeforeContact:ratio(t=>t.contact.before,t=>t.contact.carries),yardsAfterContact:ratio(t=>t.contact.after,t=>t.contact.carries),
    runEPA:ratio(t=>t.epa.run.sum,t=>t.epa.run.n),passEPA:ratio(t=>t.epa.pass.sum,t=>t.epa.pass.n),
    runEPAAllowed:ratio((t,o)=>o?.epa.run.sum||0,(t,o)=>o?.epa.run.n||0),passEPAAllowed:ratio((t,o)=>o?.epa.pass.sum||0,(t,o)=>o?.epa.pass.n||0),
    blitzRate:ratio((t,o)=>o?.chart.blitzes||0,(t,o)=>o?.chart.passes||0),
    passEPAAgainstBlitz:sum(t=>t.chart.blitzPlays)>=20?ratio(t=>t.chart.blitzEPA,t=>t.chart.blitzPlays):null,
    motionRate:ratio(t=>t.chart.motion,t=>t.chart.plays),playActionRate:ratio(t=>t.chart.playAction,t=>t.chart.plays),
    kickingAboveExpected:ratio(t=>t.special.fgMade-t.special.fgExpected,t=>t.special.fgAttempts),
    puntNet:ratio(t=>t.special.puntNetSum,t=>t.special.punts),returnAverage:ratio(t=>t.special.returnYards,t=>t.special.returns),
    coverage:{routes:"unavailable",manZone:"unavailable",blockingGrades:"unavailable",runBlocking:"yards before contact; not a blocking grade",epa:"nflfastR via nflverse"}};
}
export function enrichmentAdjustment(home,away){
  if(!home||!away)return {margin:0,total:0,components:{},status:"insufficient history"};
  const diff=(a,b)=>a!=null&&b!=null?a-b:0,credibility=clamp(Math.min(home.games,away.games)/6,0,1);
  const pressure=clamp((diff(away.pressureAllowed,home.pressureAllowed)+diff(home.pressureGenerated,away.pressureGenerated))*.8,-.35,.35);
  const contact=clamp(diff(home.yardsBeforeContact,away.yardsBeforeContact)*.12,-.2,.2);
  const epa=clamp((diff(home.runEPA,away.runEPA)+diff(home.passEPA,away.passEPA)+diff(away.runEPAAllowed,home.runEPAAllowed)+diff(away.passEPAAllowed,home.passEPAAllowed))*.3,-.4,.4);
  const blitz=(team,opponent)=>team.passEPAAgainstBlitz!=null&&team.passEPA!=null&&opponent.blitzRate!=null?clamp((team.passEPAAgainstBlitz-team.passEPA)*opponent.blitzRate*.25,-.12,.12):0;
  const matchup=blitz(home,away)-blitz(away,home);
  const special=clamp(diff(home.kickingAboveExpected,away.kickingAboveExpected)*.6+diff(home.puntNet,away.puntNet)*.015,-.3,.3);
  return {margin:Math.round(clamp((pressure+contact+epa+matchup+special)*credibility,-1,1)*100)/100,total:0,
    components:{pressure,contact,epa,blitzMatchup:matchup,specialTeams:special,credibility},status:"conservative evidence adjustment; not a trained coefficient claim"};
}
export function roleFactor(item,profile,enrichment){
  const starters=profile?.starters||[],starter=starters.find(p=>item.athleteId?String(item.athleteId)===p.id:identity(p.name)===identity(item.name));
  const normalized=identity(item.name),snap=enrichment?.snaps?.filter(p=>identity(p.name)===normalized);
  if(snap?.length===1){
    const defensive=/DE|DT|NT|DL|LB|CB|DB|FS|SS|S|EDGE/.test(String(item.position||"").toUpperCase());
    const share=defensive?snap[0].defense:snap[0].offense;
    if(share!=null)return {factor:clamp(.35+.9*share,starter?.95:.35,1.25),source:"last-game actual snap share",snapShare:share};
  }
  if(starter)return {factor:1,source:"published depth-chart starter",replacement:starter.replacements?.[0]||null};
  const backup=starters.some(p=>p.replacements?.some(r=>item.athleteId?String(item.athleteId)===r.id:identity(r.name)===normalized));
  return backup?{factor:.55,source:"published depth-chart backup"}:{factor:1,source:"position prior; role unknown"};
}
export function dataQuality(game,event,now=new Date()){
  const near=new Date(game.date)-now<=6*3600000,maxOddsAge=near?90*60000:2*3600000;
  const fresh=new Set(event?.freshBookmakers||[]),times=[];
  for(const b of event?.bookmakers||[]){
    if(!fresh.has(identity(b.title||b.key)))continue;
    const raw=b.last_update||b.lastUpdate||event?.oddsFetchedAt;
    const time=new Date(raw).getTime();if(raw&&Number.isFinite(time)&&time<=now.getTime()+60000)times.push(time);
  }
  const oddsAge=times.length?now.getTime()-Math.max(...times):null;
  const injuryTime=game.injuries?.updatedAt?new Date(game.injuries.updatedAt).getTime():NaN;
  const injuryAge=Number.isFinite(injuryTime)?now.getTime()-injuryTime:null,reasons=[],warnings=[];
  if(oddsAge==null||oddsAge>maxOddsAge)reasons.push("Fresh sportsbook lines unavailable");
  if(game.injuries?.coverage==="unavailable")reasons.push("Current injury coverage unavailable");
  else if(injuryAge==null||game.injuries?.source==="Unavailable")warnings.push("Injury coverage unavailable");
  else if(injuryAge>(near?24:72)*3600000)reasons.push("Injury report is stale");
  if(game.injuries?.source==="Covers")warnings.push("Public injury listing; official game-day availability unverified");
  const listed=[...(game.injuries?.home||[]),...(game.injuries?.away||[])];
  if(listed.some(item=>/questionable|doubtful|probable/i.test(item.status||"")&&(!item.reportedAt||now-new Date(item.reportedAt)>7*86400000)))reasons.push("Listed injury status needs confirmation");
  const coverage=game.prediction?.contextEvidence;
  if(!coverage?.home||!coverage?.away)warnings.push("Limited independent play-by-play history");
  return {eligible:!reasons.length,reasons,warnings,oddsAgeMinutes:oddsAge==null?null:Math.round(oddsAge/60000),injuryAgeHours:injuryAge==null?null:Math.round(injuryAge/3600000),
    reliabilityFactor:clamp(1-reasons.length*.12-warnings.length*.05,.65,1),checkedAt:now.toISOString()};
}

export async function loadCollegeAdvanced(season,now=new Date()){
  const path="data/college-enrichment.json",cached=await read(path,{rows:[],talent:[],recruiting:[],returning:[],sourceHealth:{}}),apiKey=process.env.CFBD_API_KEY?.trim();
  if(!apiKey)return {...cached,sourceStatus:cached.rows?.length?"cached; credentials unavailable":"not connected"};
  if(process.env.REFRESH_TEAM_STATS!=='1'&&cached.season===season&&now-new Date(cached.updatedAt)<6*3600000)return cached;
  const request=async(path,params)=>{
    const response=await fetch("https://api.collegefootballdata.com"+path+"?"+new URLSearchParams(params),{headers:{Authorization:"Bearer "+apiKey},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(path+" "+response.status);
    const payload=await response.json();if(!Array.isArray(payload))throw Error("Invalid "+path+" feed");return payload;
  };
  const feeds={
    advanced:request("/stats/game/advanced",{year:String(season),seasonType:"regular",excludeGarbageTime:"true"}),
    talent:request("/talent",{year:String(season)}),
    recruiting:request("/recruiting/teams",{year:String(season)}),
    returning:request("/player/returning",{year:String(season)})
  };
  const settled=await Promise.allSettled(Object.values(feeds)),names=Object.keys(feeds),sourceHealth={};
  const result={season,updatedAt:now.toISOString(),rows:cached.rows||[],talent:cached.talent||[],recruiting:cached.recruiting||[],returning:cached.returning||[]};
  settled.forEach((entry,index)=>{
    const name=names[index];
    if(entry.status==="fulfilled"){
      const key=name==="advanced"?"rows":name;result[key]=entry.value;
      sourceHealth[name]={status:"available",rows:entry.value.length,fetchedAt:now.toISOString()};
    }else sourceHealth[name]={status:result[name==="advanced"?"rows":name]?.length?"cached":"unavailable",fetchedAt:now.toISOString()};
  });
  result.sourceHealth=sourceHealth;
  const available=Object.values(sourceHealth).filter(source=>source.status==="available").length;
  result.sourceStatus=available===names.length?"connected; four college datasets":available?"partial; retained cached fallbacks":"unavailable; retained prior metrics";
  result.source="CollegeFootballData advanced game PPA, line yards, roster talent, recruiting, and returning production; ESPN summaries provide independent game/drive context";
  await mkdir("data",{recursive:true});await writeFile(path,JSON.stringify(result)+"\n");return result;
}
export function attachCollegeAdvanced(games,data){
  const byId=new Map(games.map(g=>[String(g.id),g]));
  for(const row of data.rows||[]){
    const g=byId.get(String(row.gameId));if(!g)continue;
    const sides=["home","away"].filter(side=>identity(g[side]).startsWith(identity(row.team)));
    if(sides.length!==1)continue;
    const side=sides[0];g.collegeAdvanced||={};g.collegeAdvanced[side]=row;
  }
  const index=(rows,field)=>(rows||[]).map(row=>({key:identity(row[field]),row}));
  const talent=index(data.talent,"school"),recruiting=index(data.recruiting,"team"),returning=index(data.returning,"team");
  const match=(rows,name)=>{const key=identity(name),matches=rows.filter(item=>item.key===key||key.startsWith(item.key)||item.key.startsWith(key));return matches.length===1?matches[0].row:null};
  for(const game of games)for(const side of ["home","away"]){
    const program={talent:match(talent,game[side]),recruiting:match(recruiting,game[side]),returning:match(returning,game[side])};
    if(Object.values(program).some(Boolean)){game.collegeProgram||={};game.collegeProgram[side]=program}
  }
}
export function collegeFor(games,name,before){
  const date=new Date(before),eligible=games.filter(g=>new Date(g.date)<date&&Number(g.season)===date.getUTCFullYear()&&(g.home===name||g.away===name)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const rows=eligible.filter(complete).slice(0,8).map(g=>g.collegeAdvanced?.[g.home===name?"home":"away"]).filter(Boolean);
  if(!rows.length)return null;
  const average=(unit,key)=>{const values=rows.map(r=>numeric(r[unit]?.[key])).filter(v=>v!=null);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null};
  const program=eligible.map(g=>g.collegeProgram?.[g.home===name?"home":"away"]).find(Boolean)||null;
  const returning=program?.returning||{},talent=program?.talent||{},recruiting=program?.recruiting||{};
  return {games:rows.length,offensePPA:average("offense","ppa"),defensePPA:average("defense","ppa"),lineYards:average("offense","lineYards"),lineYardsAllowed:average("defense","lineYards"),
    stuffRate:average("offense","stuffRate"),stuffRateGenerated:average("defense","stuffRate"),
    talentScore:numeric(talent.talent),recruitingPoints:numeric(recruiting.points),recruitingRank:numeric(recruiting.rank),
    returningPPA:numeric(returning.percentPPA),returningUsage:numeric(returning.percentUsage),returningPassingPPA:numeric(returning.percentPassingPPA),
    source:"CollegeFootballData PPA, line yards, talent, recruiting, and returning production; ESPN provides independent game context; not player blocking grades"};
}
export function collegeAdjustment(home,away){
  if(!home||!away)return {margin:0,total:0,status:"college advanced feed not connected or insufficient history"};
  const diff=(a,b)=>a!=null&&b!=null?a-b:0;
  const performance=(diff(home.offensePPA,away.offensePPA)+diff(away.defensePPA,home.defensePPA))*.3+
    (diff(home.lineYards,away.lineYards)+diff(away.lineYardsAllowed,home.lineYardsAllowed))*.04;
  // Preseason roster inputs are slow-moving priors. Keep them small because
  // team results and sportsbook consensus already contain much of this signal.
  const roster=clamp(diff(home.talentScore,away.talentScore)/900+diff(home.recruitingPoints,away.recruitingPoints)/140+
    diff(home.returningPPA,away.returningPPA)*.45+diff(home.returningUsage,away.returningUsage)*.2,-.35,.35);
  const credibility=clamp(Math.min(home.games,away.games)/6,0,1);
  const margin=Math.round(clamp(performance,-.5,.5)*credibility*100+roster*(1-.45*credibility)*100)/100;
  return {margin:Math.round(clamp(margin,-.75,.75)*100)/100,total:0,components:{performance:Math.round(clamp(performance,-.5,.5)*credibility*100)/100,rosterPrior:Math.round(roster*(1-.45*credibility)*100)/100,credibility},status:"multi-source college efficiency and roster context with duplicate-signal caps"};
}
