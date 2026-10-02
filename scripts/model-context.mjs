// Supported ESPN evidence only. Missing tracking/snap/EPA data is explicitly unknown.
export const numeric=value=>{if(value==null||value==="")return null;const n=Number(value);return Number.isFinite(n)?n:null};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const clock=value=>{const match=String(value||"").match(/^(\d+):(\d+)$/);return match?Number(match[1])*60+Number(match[2]):null};
export const isOffensive=play=>!play.isPenalty&&Number(play.start?.down)>=1&&Number(play.start?.down)<=4&&!/kneel|spike/i.test(play.text||"")&&/rush|pass|sack|fumble recovery/i.test(play.type?.text||"");
const kindOf=play=>/pass|sack/i.test(play.type?.text||"")?"pass":"run";

export function playerProduction(summary,teamId){
  const team=(summary?.boxscore?.players||[]).find(row=>String(row.team?.id)===String(teamId));
  const players=[];
  for(const group of team?.statistics||[]){
    const kind=String(group.name||"").toLowerCase();
    if(!["passing","rushing","receiving","defensive"].includes(kind))continue;
    const labels=(group.labels||[]).map(label=>String(label).toUpperCase());
    const read=(row,...names)=>{const index=labels.findIndex(label=>names.includes(label));return index<0?null:numeric(row.stats?.[index])};
    for(const row of group.athletes||[]){
      const id=row.athlete?.id;if(!id)continue;
      const combined=String(row.stats?.[labels.indexOf("C/ATT")]??"").split("/");
      const usage=kind==="passing"?(combined.length===2?numeric(combined[1]):read(row,"ATT")):kind==="rushing"?read(row,"CAR","ATT"):kind==="receiving"?read(row,"TGTS","REC"):read(row,"TOT");
      // Tackles measure recorded production, never defensive snaps or proof of absence.
      players.push({id:String(id),name:row.athlete.displayName||null,kind,usage:usage??0,usageKnown:usage!=null,
        yards:read(row,"YDS"),touchdowns:read(row,"TD"),interceptions:read(row,"INT"),
        completions:kind==="passing"?numeric(combined[0]):null,receptions:read(row,"REC"),
        sacks:read(row,"SACKS"),qbHits:read(row,"QB HTS"),tackles:read(row,"TOT")});
    }
  }
  return players;
}

// Match only unambiguous offense names in ESPN text when structured participants are absent.
export function playCreator(play,players,kind){
  const role=kind==="pass"?"receiver":"rusher";
  const structured=(play.participants||[]).find(item=>String(item.type||"").toLowerCase()===role)?.athlete;
  if(structured?.id)return {id:String(structured.id),name:structured.displayName||null};
  const text=String(play.text||""),eligible=players.filter(p=>p.kind===(kind==="pass"?"receiving":"rushing"));
  const captured=kind==="pass"?text.match(/\bpass\b.*?\bto\s+([A-Za-z.'’-]+(?:\s+[A-Za-z.'’-]+)?)/i)?.[1]:text.replace(/^\([^)]*\)\s*/,"").match(/^([A-Za-z.'’-]+(?:\s+[A-Za-z.'’-]+)?)\s+(?:left|right|up|rush|to|scrambles)/i)?.[1];
  if(!captured)return null;
  const token=captured.split(/\s+(?:to|for|left|right|up)\b/i)[0];
  const matches=eligible.filter(p=>{
    const names=String(p.name||"").split(/\s+/),short=names[0]?.[0]+"."+names.slice(1).join(" ");
    return key(token)===key(p.name)||key(token)===key(short);
  });
  return matches.length===1?matches[0]:null;
}

export function extractContext(summary,game){
  const drives=[...(summary?.drives?.previous||[]),...(summary?.drives?.current?[summary.drives.current]:[])];
  const unique=[...new Map(drives.flatMap(d=>d.plays||[]).map(p=>[String(p.id),p])).values()].sort((a,b)=>Number(a.sequenceNumber||a.id)-Number(b.sequenceNumber||b.id));
  const scoresBefore=new Map();let home=0,away=0;
  for(const play of unique){scoresBefore.set(String(play.id),{home,away});home=numeric(play.homeScore)??home;away=numeric(play.awayScore)??away}
  const result={};
  for(const side of ["home","away"]){
    const id=String(game[side+"Id"]),opponentId=String(game[(side==="home"?"away":"home")+"Id"]);
    const counters={run:{plays:0,success:0,yards:0},pass:{plays:0,success:0,yards:0}};
    let sacks=0,dropbacks=0,earlyPasses=0,earlyPlays=0,garbagePlays=0,competitivePlays=0,paceSeconds=0,paceIntervals=0;
    const scripts={leading:{plays:0,passes:0},tied:{plays:0,passes:0},trailing:{plays:0,passes:0}};
    for(const drive of drives){
      let last=null;
      for(const play of drive.plays||[]){
        if(String(play.start?.team?.id)!==id||!isOffensive(play))continue;
        const pre=scoresBefore.get(String(play.id)),difference=pre?(side==="home"?pre.home-pre.away:pre.away-pre.home):null,period=Number(play.period?.number);
        if(difference==null)continue;
        const garbage=(period>=3&&Math.abs(difference)>=28)||(period>=4&&Math.abs(difference)>=21);
        if(garbage){garbagePlays++;last=null;continue}
        const kind=kindOf(play),down=Number(play.start.down),distance=numeric(play.start.distance),yards=numeric(play.statYardage);
        const row=counters[kind];competitivePlays++;
        if(distance!=null&&distance>0&&yards!=null){
          row.plays++;row.yards+=yards;
          const threshold=down===1?.4:down===2?.6:1;
          if(!play.isTurnover&&yards>=distance*threshold)row.success++;
        }
        if(kind==="pass"){dropbacks++;if(/sack/i.test(play.type?.text||""))sacks++}
        if(down<=2){earlyPlays++;if(kind==="pass")earlyPasses++}
        const script=difference>0?"leading":difference<0?"trailing":"tied";
        scripts[script].plays++;if(kind==="pass")scripts[script].passes++;
        const seconds=clock(play.clock?.displayValue);
        if(last&&last.period===period&&seconds!=null){const elapsed=last.seconds-seconds;if(elapsed>0&&elapsed<=60){paceSeconds+=elapsed;paceIntervals++}}
        last=seconds!=null?{period,seconds}:null;
      }
    }
    let possessions=0,redZoneTrips=0,redZoneTDs=0,shortFieldPoints=0;
    for(const drive of drives){
      if(String(drive.team?.id)!==id||!drive.result||/end of half|end of game|end period/i.test(drive.result))continue;
      const plays=(drive.plays||[]).filter(p=>String(p.start?.team?.id)===id&&isOffensive(p));
      if(!plays.length)continue;
      possessions++;
      const touchdown=/^(TD|TOUCHDOWN)$/i.test(drive.result)||/touchdown/i.test(drive.displayResult||"");
      const fieldGoal=/^(FG|FIELD GOAL)$/i.test(drive.result)&&!/miss/i.test(drive.displayResult||"");
      const offensiveTD=touchdown&&plays.some(p=>/passing touchdown|rushing touchdown/i.test(p.type?.text||""));
      const points=offensiveTD?6:fieldGoal?3:0;
      if(plays.some(p=>numeric(p.start?.yardsToEndzone)!=null&&numeric(p.start.yardsToEndzone)<=20)){redZoneTrips++;if(offensiveTD)redZoneTDs++}
      const start=numeric(plays[0]?.start?.yardsToEndzone);
      if(start!=null&&start<=50)shortFieldPoints+=points;
    }
    const scoring=summary?.scoringPlays;
    const nonOffensivePoints=Array.isArray(scoring)?scoring.filter(p=>String(p.team?.id)===id&&/interception return|fumble return|fumble recovery.*touchdown|kickoff return|punt return/i.test(p.type?.text||"")).reduce((sum,p)=>sum+(/touchdown/i.test(p.type?.text||"")?6:0),0):null;
    const playerRows=playerProduction(summary,id);
    const defensiveRows=playerRows.filter(p=>p.kind==="defensive");
    const qbHits=defensiveRows.length&&defensiveRows.some(p=>p.qbHits!=null)?defensiveRows.reduce((sum,p)=>sum+(p.qbHits||0),0):null;
    result[side]={run:counters.run,pass:counters.pass,sacks,dropbacks,earlyPasses,earlyPlays,competitivePlays,garbagePlays,
      paceSeconds,paceIntervals,possessions:possessions||null,scripts,redZoneTrips,redZoneTDs,shortFieldPoints,nonOffensivePoints,qbHits,
      coverage:{epa:"unavailable",snapCounts:"unavailable",pressureRate:"unavailable",lineEvidence:"sacks and quarterback hits; not true pressures",playerUsage:"box-score opportunities; not snaps"}};
  }
  return result;
}

export function buildContextLookup(games){
  const completed=games.filter(g=>g.statusCompleted||/final/i.test(g.status||""));
  return (name,before)=>{
    const date=new Date(before),season=date.getUTCFullYear();
    const rows=completed.filter(g=>new Date(g.date)<date&&Number(g.season)===season&&(g.home===name||g.away===name)).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
    const valid=rows.filter(g=>g.performance?.[g.home===name?"home":"away"]?.context);
    if(!valid.length)return null;
    const sum=(fn)=>valid.reduce((total,g,i)=>total+fn(g,g.home===name?"home":"away")*Math.pow(.85,i),0);
    const ctx=(g,side)=>g.performance[side].context,opp=(g,side)=>ctx(g,side==="home"?"away":"home");
    const rate=(num,den)=>{const d=sum(den);return d>0?sum(num)/d:null};
    const residual=(kind)=>{
      const values=[];
      for(const game of valid){
        const side=game.home===name?"home":"away",opponent=game[side==="home"?"away":"home"],beforeGame=new Date(game.date);
        const prior=completed.filter(g=>new Date(g.date)<beforeGame&&Number(g.season)===season&&(g.home===opponent||g.away===opponent)).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
        let successes=0,plays=0;
        for(const g of prior){const c=g.performance?.[g.home===opponent?"home":"away"]?.context?.[kind];if(c){successes+=c.success;plays+=c.plays}}
        const allowed=opp(game,side)?.[kind];
        if(plays>=30&&allowed?.plays>=10)values.push(allowed.success/allowed.plays-successes/plays);
      }
      return values.length>=2?values.reduce((a,b)=>a+b,0)/values.length:null;
    };
    const leagueRows=completed.filter(g=>new Date(g.date)<date&&Number(g.season)===season).flatMap(g=>["home","away"].map(s=>g.performance?.[s]?.context?.possessions)).filter(v=>v!=null);
    const leaguePossessions=leagueRows.length>=8?leagueRows.reduce((a,b)=>a+b,0)/leagueRows.length:null;
    const rzRows=completed.filter(g=>new Date(g.date)<date&&Number(g.season)===season).flatMap(g=>["home","away"].map(s=>g.performance?.[s]?.context)).filter(c=>c?.redZoneTrips>0);
    const rzTrips=rzRows.reduce((sum,c)=>sum+c.redZoneTrips,0),leagueRedZoneRate=rzTrips>=20?rzRows.reduce((sum,c)=>sum+c.redZoneTDs,0)/rzTrips:null;
    return {games:valid.length,leaguePossessions,leagueRedZoneRate,
      redZoneTrips:sum((g,s)=>ctx(g,s).redZoneTrips),redZoneTDs:sum((g,s)=>ctx(g,s).redZoneTDs),
      runSuccess:rate((g,s)=>ctx(g,s).run.success,(g,s)=>ctx(g,s).run.plays),
      passSuccess:rate((g,s)=>ctx(g,s).pass.success,(g,s)=>ctx(g,s).pass.plays),
      runAllowed:rate((g,s)=>opp(g,s).run.success,(g,s)=>opp(g,s).run.plays),
      passAllowed:rate((g,s)=>opp(g,s).pass.success,(g,s)=>opp(g,s).pass.plays),
      runDefenseResidual:residual("run"),passDefenseResidual:residual("pass"),
      sackAllowed:rate((g,s)=>ctx(g,s).sacks,(g,s)=>ctx(g,s).dropbacks),
      sackGenerated:rate((g,s)=>opp(g,s).sacks,(g,s)=>opp(g,s).dropbacks),
      qbHitsPerGame:rate((g,s)=>ctx(g,s).qbHits??0,(g,s)=>ctx(g,s).qbHits==null?0:1),
      earlyPassRate:rate((g,s)=>ctx(g,s).earlyPasses,(g,s)=>ctx(g,s).earlyPlays),
      secondsPerPlay:rate((g,s)=>ctx(g,s).paceSeconds,(g,s)=>ctx(g,s).paceIntervals),
      possessions:rate((g,s)=>ctx(g,s).possessions??0,(g,s)=>ctx(g,s).possessions==null?0:1),
      redZoneTDRate:rate((g,s)=>ctx(g,s).redZoneTDs,(g,s)=>ctx(g,s).redZoneTrips),
      garbageShare:rate((g,s)=>ctx(g,s).garbagePlays,(g,s)=>ctx(g,s).garbagePlays+ctx(g,s).competitivePlays),
      scripts:Object.fromEntries(["leading","tied","trailing"].map(k=>[k,rate((g,s)=>ctx(g,s).scripts[k].passes,(g,s)=>ctx(g,s).scripts[k].plays)])),
      epa:null,pressureRate:null,snapCounts:null};
  };
}

export function contextAdjustment(home,away){
  if(!home||!away)return {margin:0,total:0,coverage:"insufficient history",components:{}};
  const credibility=clamp(Math.min(home.games,away.games)/6,0,1);
  const diff=(a,b)=>a!=null&&b!=null?a-b:0;
  const defensiveResidual=diff(away.runDefenseResidual,home.runDefenseResidual)+diff(away.passDefenseResidual,home.passDefenseResidual);
  const efficiency=clamp((diff(home.runSuccess,away.runSuccess)+diff(home.passSuccess,away.passSuccess))*3+defensiveResidual*2,-.75,.75);
  const line=clamp((diff(away.sackAllowed,home.sackAllowed)+diff(home.sackGenerated,away.sackGenerated))*3,-.5,.5);
  const pace=home.possessions!=null&&away.possessions!=null&&home.leaguePossessions!=null&&away.leaguePossessions!=null?clamp(((home.possessions+away.possessions)/2-(home.leaguePossessions+away.leaguePossessions)/2)*.3,-.75,.75):0;
  const rzRegression=team=>{
    if(team.leagueRedZoneRate==null||!team.redZoneTrips)return 0;
    const rate=team.redZoneTDs/team.redZoneTrips,shrunk=(team.redZoneTDs+12*team.leagueRedZoneRate)/(team.redZoneTrips+12);
    return clamp((shrunk-rate)*(team.redZoneTrips/team.games)*6*.15,-.35,.35);
  };
  const homeRedZone=rzRegression(home),awayRedZone=rzRegression(away);
  return {margin:Math.round(clamp((efficiency+line+homeRedZone-awayRedZone)*credibility,-1.25,1.25)*100)/100,total:Math.round(clamp((pace+homeRedZone+awayRedZone)*credibility,-1,1)*100)/100,
    coverage:"supported evidence; conservative uncalibrated caps",components:{efficiency,line,pace,redZoneRegression:{home:homeRedZone,away:awayRedZone},credibility}};
}

export function sustainablePoints(game,side){
  const observed=numeric(game[side+"Score"]),context=game.performance?.[side]?.context;
  if(observed==null||!context)return observed;
  // Remove part of unusual scoring; retain special-team contribution in the team forecast.
  return Math.max(0,observed-clamp((context.nonOffensivePoints??0)*.65+context.shortFieldPoints*.2,0,7));
}

export function playerInjuryValue(games,game,side,item){
  const position=String(item.position||"").toUpperCase(),kind=position==="QB"?"passing":position==="RB"?"rushing":["WR","TE"].includes(position)?"receiving":null;
  const base=numeric(item.expectedLoss)??0;
  if(!kind)return {expectedLoss:base,source:"position prior",replacementQuality:null};
  const before=new Date(game.date),team=game[side],rows=games.filter(g=>(g.statusCompleted||/final/i.test(g.status||""))&&new Date(g.date)<before&&Number(g.season)===Number(game.season)&&(g.home===team||g.away===team)).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  const byPlayer=new Map();let opportunities=0,observedGames=0;
  for(const g of rows){
    const players=(g.performance?.[g.home===team?"home":"away"]?.players||[]).filter(p=>p.kind===kind&&p.usageKnown&&p.usage>0);
    if(players.length)observedGames++;
    for(const player of players){opportunities+=player.usage;const v=byPlayer.get(player.id)||{id:player.id,name:player.name,usage:0,yards:0,yardUsage:0,games:0};v.usage+=player.usage;v.games++;if(player.yards!=null){v.yards+=player.yards;v.yardUsage+=player.usage}byPlayer.set(player.id,v)}
  }
  const matches=[...byPlayer.values()].filter(p=>item.athleteId?String(item.athleteId)===p.id:key(item.name)===key(p.name));
  if(matches.length!==1||observedGames<2||!opportunities)return {expectedLoss:base,source:"position prior; insufficient player history",replacementQuality:null};
  const player=matches[0],share=player.usage/opportunities;
  const baseline=kind==="passing"?7:kind==="rushing"?4.3:8;
  const efficiency=player.yardUsage>=15?clamp((player.yards/player.yardUsage)/baseline,.7,1.3):1;
  const alternatives=[...byPlayer.values()].filter(p=>p.id!==player.id&&p.yardUsage>=15).sort((a,b)=>b.usage-a.usage);
  const replacement=alternatives[0],gap=replacement&&player.yardUsage>=15?clamp((player.yards/player.yardUsage-replacement.yards/replacement.yardUsage)/baseline,-.2,.3):0;
  const role=kind==="passing"?clamp(share/.8,.15,1.2):clamp(share/.35,.15,1.5);
  const factor=clamp((role*efficiency+gap)*.6+.4,.35,1.4);
  return {expectedLoss:Math.round(base*factor*100)/100,source:"prior workload and efficiency; observed replacement when available",usageShare:share,historyGames:observedGames,
    replacementQuality:replacement?{id:replacement.id,name:replacement.name,yardsPerOpportunity:replacement.yards/replacement.yardUsage,sample:replacement.yardUsage}:null};
}

// Fit the same opponent-adjusted scoring model for paired baseline/candidate snapshots.
export function fitRatings(records,{leagueMean,priorGames,blowoutMargin=Infinity,blowoutDiscount=1,sustainable=false}){
  let ratings=new Map([...records].map(([name,rows])=>[name,{offense:0,defense:0,games:rows.length,effectiveGames:0,for:leagueMean,against:leagueMean}]));
  for(let pass=0;pass<10;pass++){
    const next=new Map();
    for(const [name,rows] of records){
      let off=0,def=0,ow=0,dw=0,forPoints=0,againstPoints=0;
      for(const r of rows){
        const opponent=ratings.get(r.opponent)||{offense:0,defense:0};
        const w=(r.baseWeight??r.weight)*(Math.abs(r.scored-r.allowed)>=blowoutMargin?blowoutDiscount:1);
        const offenseWeight=w*(r.offenseWeight??1),defenseWeight=w*(r.defenseWeight??1);
        const scored=sustainable?(r.sustainableScored??r.scored):r.scored,allowed=sustainable?(r.sustainableAllowed??r.allowed):r.allowed;
        off+=offenseWeight*(clamp(scored,0,leagueMean*2.45)-leagueMean+opponent.defense);
        def+=defenseWeight*(leagueMean-clamp(allowed,0,leagueMean*2.45)+opponent.offense);
        forPoints+=offenseWeight*scored;againstPoints+=defenseWeight*allowed;ow+=offenseWeight;dw+=defenseWeight;
      }
      next.set(name,{offense:off/(ow+priorGames),defense:def/(dw+priorGames),games:rows.length,effectiveGames:Math.min(ow,dw),for:ow?forPoints/ow:leagueMean,against:dw?againstPoints/dw:leagueMean});
    }
    ratings=next;
  }
  return ratings;
}
