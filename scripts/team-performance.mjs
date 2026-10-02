// Derived only from completed games. A missing or partial play log is never treated as zero production.
const number=value=>{if(value==null||value==="")return null;const n=Number(value);return Number.isFinite(n)?n:null};
const limit=(value,min,max)=>Math.max(min,Math.min(max,value));
const ratio=(team,name)=>{
  const raw=(team?.statistics||[]).find(item=>item.name===name)?.displayValue||"";
  const match=String(raw).match(/^(\d+)-(\d+)$/);
  return match?{made:Number(match[1]),attempts:Number(match[2])}:null;
};
const stat=(team,name)=>{
  const row=(team?.statistics||[]).find(item=>item.name===name);
  return number(row?.value)??number(row?.displayValue);
};
export function extractPerformance(summary,game){
  const teams=summary?.boxscore?.teams||[];
  const drives=[...(summary?.drives?.previous||[]),...(summary?.drives?.current?[summary.drives.current]:[])];
  const plays=[...new Map(drives.flatMap(drive=>drive.plays||[]).map(play=>[String(play.id),play])).values()];
  if(!plays.length||teams.length<2)return null;
  const result={};
  for(const side of ["home","away"]){
    const id=String(game[`${side}Id`]||"");
    const team=teams.find(entry=>String(entry.team?.id)===id);
    if(!team)return null;
    let snaps=0,passSnaps=0,runSnaps=0,explosivePasses=0,explosiveRuns=0;
    const creators={};
    for(const play of plays){
      if(String(play.start?.team?.id||"")!==id||play.isPenalty)continue;
      const type=String(play.type?.text||"").toLowerCase();
      const pass=/pass reception|passing touchdown|pass incompletion|pass interception|sack/.test(type);
      const run=/^rush$|rushing touchdown/.test(type);
      if(!pass&&!run)continue;
      snaps++;
      if(pass)passSnaps++;else runSnaps++;
      // Use the runner or receiver, not the passer, to attribute explosive gains.
      const role=pass?"receiver":"rusher";
      const participant=(play.participants||[]).find(item=>String(item.type||"").toLowerCase()===role);
      const athleteId=participant?.athlete?.id;
      if(athleteId){
        const key=String(athleteId)+":"+(pass?"pass":"run");
        const creator=creators[key]||(creators[key]={id:String(athleteId),name:participant.athlete.displayName||null,kind:pass?"pass":"run",opportunities:0,explosives:0});
        creator.opportunities++;
        if((run||/pass reception|passing touchdown/.test(type))&&number(play.statYardage)>=(pass?20:10))creator.explosives++;
      }
      // ESPN's statYardage on a return is return yardage; count only completed offensive plays.
      if(/pass reception|passing touchdown/.test(type)&&number(play.statYardage)>=20)explosivePasses++;
      if(run&&number(play.statYardage)>=10)explosiveRuns++;
    }
    if(!snaps)return null;
    const turnovers=stat(team,"turnovers")??((stat(team,"interceptions")??0)+(stat(team,"fumblesLost")??0));
    const players=[];
    const playerTeam=(summary?.boxscore?.players||[]).find(entry=>String(entry.team?.id)===id);
    for(const group of playerTeam?.statistics||[]){
      const kind=String(group.name||"").toLowerCase();
      if(!["passing","rushing","receiving"].includes(kind))continue;
      const labels=group.labels||[];
      const index=labels.findIndex(label=>kind==="passing"?/^(C\/ATT|ATT)$/i.test(label):kind==="rushing"?/^ATT$/i.test(label):/^REC$/i.test(label));
      if(index<0)continue;
      for(const item of group.athletes||[]){
        const raw=String(item.stats?.[index]??"");
        const usage=number(raw.includes("/")?raw.split("/")[1]:raw);
        if(item.athlete?.id&&usage>0)players.push({id:String(item.athlete.id),name:item.athlete.displayName||null,kind,usage});
      }
    }
    result[side]={players,snaps,passSnaps,runSnaps,creators:Object.values(creators),explosivePasses,explosiveRuns,explosivePlays:explosivePasses+explosiveRuns,turnovers,thirdDown:ratio(team,"thirdDownEff"),fourthDown:ratio(team,"fourthDownEff"),yardsPerPlay:stat(team,"yardsPerPlay")};
  }
  for(const side of ["home","away"]){
    const opponent=result[side==="home"?"away":"home"];
    result[side].explosiveAllowed=opponent.explosivePlays;
    result[side].takeaways=opponent.turnovers;
  }
  result.schemaVersion=4;
  return result;
}
export async function loadPerformance(games,previous,sport){
  const old=new Map((previous.games||[]).filter(game=>game.performance).map(game=>[String(game.id),game.performance]));
  const finals=games.filter(game=>game.statusCompleted||/final/i.test(game.status||""));
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(6,finals.length)},async()=>{
    while(cursor<finals.length){
      const game=finals[cursor++];
      if(old.get(String(game.id))?.schemaVersion===4){game.performance=old.get(String(game.id));continue}
      try{
        const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/summary?event=${encodeURIComponent(game.id)}`);
        if(!response.ok)throw new Error(`ESPN summary ${response.status}`);
        const result=extractPerformance(await response.json(),game);
        if(result)game.performance=result;
      }catch{} // Missing detail must not erase cached metrics or change a projection.
      if(!game.performance&&old.has(String(game.id)))game.performance=old.get(String(game.id));
    }
  }));
  const observations=new Map();
  const athleteHistory=new Map();
  const teamHistory=new Map();
  // Chronological baselines ensure a game never supplies its own opponent-strength estimate.
  finals.sort((a,b)=>new Date(a.date)-new Date(b.date));
  for(const game of finals){
    if(!game.performance)continue;
    for(const side of ["home","away"]){
      const row=game.performance[side],opponent=game.performance[side==="home"?"away":"home"];
      if(!row?.snaps||!opponent?.snaps)continue;
      const scored=Number(game[`${side}Score`]),allowed=Number(game[`${side==="home"?"away":"home"}Score`]);
      const priorBefore=(history,key)=> (history.get(key)||[]).filter(item=>item.date<new Date(game.date)&&item.season===game.season);
      const baseline=(kind)=>{
        const snaps=opponent[kind==="run"?"runSnaps":"passSnaps"];
        const count=opponent[kind==="run"?"explosiveRuns":"explosivePasses"];
        if(!snaps)return null;
        const prior=priorBefore(teamHistory,game[side==="home"?"away":"home"]+":"+kind);
        if(!prior.length)return null;
        const attempts=prior.reduce((sum,item)=>sum+item.snaps,0);
        if(!attempts)return null;
        const priorRate=prior.reduce((sum,item)=>sum+item.count,0)/attempts;
        let expected=priorRate*snaps,covered=0;
        for(const creator of opponent.creators||[]){
          if(creator.kind!==kind)continue;
          const history=priorBefore(athleteHistory,creator.id+":"+kind);
          const opportunities=history.reduce((sum,item)=>sum+item.opportunities,0);
          if(opportunities<10)continue;
          const explosives=history.reduce((sum,item)=>sum+item.explosives,0);
          // Shrink individual rates toward their team's prior rate; cap extreme corrections.
          const rate=(explosives+20*priorRate)/(opportunities+20);
          expected+=limit(rate-priorRate,-.1,.1)*creator.opportunities;
          covered+=creator.opportunities;
        }
        return {residual:count/snaps-expected/snaps,coverage:Math.min(covered/snaps,1)};
      };
      const runDefense=baseline("run"),passDefense=baseline("pass");
      const entry={runDefense:runDefense?.residual??null,passDefense:passDefense?.residual??null,creatorCoverage:Math.max(runDefense?.coverage||0,passDefense?.coverage||0),date:new Date(game.date),season:game.season,explosiveFor:row.explosivePlays/row.snaps,explosiveAgainst:opponent.explosivePlays/opponent.snaps,turnovers:row.turnovers,takeaways:opponent.turnovers,pointsFor:scored,pointsAgainst:allowed,thirdMade:row.thirdDown?.made??null,thirdAttempts:row.thirdDown?.attempts??null,fourthMade:row.fourthDown?.made??null,fourthAttempts:row.fourthDown?.attempts??null,yardsPerPlay:row.yardsPerPlay??null};
      const name=game[side];
      if(!observations.has(name))observations.set(name,[]);
      observations.get(name).push(entry);
    }
    for(const side of ["home","away"]){
      const row=game.performance[side];
      for(const kind of ["run","pass"]){
        const key=game[side]+":"+kind;
        if(!teamHistory.has(key))teamHistory.set(key,[]);
        teamHistory.get(key).push({date:new Date(game.date),season:game.season,snaps:row[kind==="run"?"runSnaps":"passSnaps"]||0,count:row[kind==="run"?"explosiveRuns":"explosivePasses"]||0});
      }
      for(const creator of row.creators||[]){
        const key=creator.id+":"+creator.kind;
        if(!athleteHistory.has(key))athleteHistory.set(key,[]);
        athleteHistory.get(key).push({...creator,date:new Date(game.date),season:game.season});
      }
    }
  }
  return function performanceFor(name,before){
    const recent=(observations.get(name)||[]).filter(row=>row.date<before).sort((a,b)=>b.date-a.date);
    if(!recent.length)return null;
    const current=recent.filter(row=>row.season===before.getUTCFullYear());
    const sample=current.length?current:recent;
    const last3=sample.slice(0,3);
    const mean=(rows,key)=>rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
    const blend=key=>.7*mean(sample,key)+.3*mean(last3,key);
    const conversion=(rows,made,attempts)=>{const valid=rows.filter(row=>row[made]!=null&&row[attempts]>0);return valid.length?valid.reduce((sum,row)=>sum+row[made],0)/valid.reduce((sum,row)=>sum+row[attempts],0):null};
    const thirdSeason=conversion(sample,"thirdMade","thirdAttempts"),thirdRecent=conversion(last3,"thirdMade","thirdAttempts");
    const thirdDown=thirdSeason==null?thirdRecent:thirdRecent==null?thirdSeason:.7*thirdSeason+.3*thirdRecent;
    const validYards=sample.filter(row=>row.yardsPerPlay!=null);
    const defense=(key)=>{const valid=sample.filter(row=>row[key]!=null);return valid.length>=2?{value:mean(valid,key),games:valid.length}:null};
    return {runDefense: defense("runDefense"),passDefense: defense("passDefense"),creatorCoverage:mean(sample,"creatorCoverage"),games:sample.length,explosiveFor:blend("explosiveFor"),explosiveAgainst:blend("explosiveAgainst"),turnovers:blend("turnovers"),takeaways:blend("takeaways"),pointsFor:blend("pointsFor"),pointsAgainst:blend("pointsAgainst"),pointDifferential:blend("pointsFor")-blend("pointsAgainst"),thirdDown,thirdDownAttempts:sample.reduce((sum,row)=>sum+(row.thirdAttempts||0),0),fourthDown:conversion(sample,"fourthMade","fourthAttempts"),yardsPerPlay:validYards.length?mean(validYards,"yardsPerPlay"):null};
  };
}
export function performanceAdjustment(home,away){
  if(!home||!away)return {margin:0,total:0,games:0};
  const games=Math.min(home.games,away.games);
  const credibility=limit(games/6,0,1);
  // Modest regularization: rate differences are shrunk and capped until out-of-sample calibration.
  const homeExplosive=(home.explosiveFor-away.explosiveAgainst)/2;
  const awayExplosive=(away.explosiveFor-home.explosiveAgainst)/2;
  // Positive residual means allowing more explosives than the opponent normally generates.
  const defenseEdge=(key)=>home[key]&&away[key]?limit((away[key].value-home[key].value)*4,-.4,.4):0;
  const opponentAdjustedDefense=defenseEdge("runDefense")+defenseEdge("passDefense");
  const turnoverEdge=away.turnovers-home.turnovers;
  const thirdEdge=home.thirdDown!=null&&away.thirdDown!=null&&Math.min(home.thirdDownAttempts,away.thirdDownAttempts)>=12?limit((home.thirdDown-away.thirdDown)*3,-.6,.6):0;
  // Points per game and differential are exposed as evidence; scoring ratings already include them.
  const margin=limit(((homeExplosive-awayExplosive)*18+turnoverEdge*.35+thirdEdge+opponentAdjustedDefense)*credibility,-1.75,1.75);
  const total=limit((homeExplosive+awayExplosive)*10*credibility,-1,1);
  return {margin:Math.round(margin*100)/100,total:Math.round(total*100)/100,games};
}


// Historical workload context is evidence of lineup change, not an injury diagnosis.
// Only information from earlier games is used. Unobserved OL/defensive snaps remain unknown.
export function rosterGameWeights(games){
  const history=new Map(),output=new Map();
  for(const game of [...games].filter(item=>item.statusCompleted||/final/i.test(item.status||"")).sort((a,b)=>new Date(a.date)-new Date(b.date))){
    const entries={};
    for(const side of ["home","away"]){
      const key=String(game.season)+":"+game[side],prior=(history.get(key)||[]).filter(item=>item.date<new Date(game.date)).slice(-6);
      const players=game.performance?.[side]?.players;
      let missing=0;
      const evidence=[];
      if(players?.length&&prior.length>=2){
        for(const [kind,impact] of [["passing",.55],["rushing",.2],["receiving",.15]]){
          const valid=prior.filter(item=>item.players.some(player=>player.kind===kind));
          if(valid.length<2||!players.some(player=>player.kind===kind))continue;
          const usage=new Map(),appearances=new Map();
          for(const item of valid)for(const player of item.players.filter(player=>player.kind===kind)){
            usage.set(player.id,(usage.get(player.id)||0)+player.usage);
            appearances.set(player.id,(appearances.get(player.id)||0)+1);
          }
          const ranked=[...usage].sort((a,b)=>b[1]-a[1]),leader=ranked[0];
          if(!leader||appearances.get(leader[0])<2)continue;
          const share=leader[1]/[...usage.values()].reduce((sum,value)=>sum+value,0);
          if(share<(kind==="passing"?.6:.3))continue;
          if(!players.some(player=>player.kind===kind&&player.id===leader[0])){
            missing+=impact*share;
            evidence.push({id:leader[0],kind,priorUsageShare:Math.round(share*100)/100,reason:"Prior workload leader absent from recorded production"});
          }
        }
      }
      entries[side]={offenseWeight:limit(1-missing,.35,1),evidence,coverage:players?.length?"skill-position production":"unknown"};
      if(players?.length){
        if(!history.has(key))history.set(key,[]);
        history.get(key).push({date:new Date(game.date),players});
      }
    }
    output.set(String(game.id),entries);
    game.rosterContext=entries;
  }
  return (game,side)=>output.get(String(game.id))?.[side]?.offenseWeight??1;
}
