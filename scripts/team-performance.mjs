// Derived only from completed games. A missing or partial play log is never treated as zero production.
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
const limit=(value,min,max)=>Math.max(min,Math.min(max,value));
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
    let snaps=0,explosivePasses=0,explosiveRuns=0;
    for(const play of plays){
      if(String(play.start?.team?.id||"")!==id||play.isPenalty)continue;
      const type=String(play.type?.text||"").toLowerCase();
      const pass=/pass reception|passing touchdown|pass incompletion|pass interception|sack/.test(type);
      const run=/^rush$|rushing touchdown/.test(type);
      if(!pass&&!run)continue;
      snaps++;
      // ESPN's statYardage on a return is return yardage; count only completed offensive plays.
      if(/pass reception|passing touchdown/.test(type)&&number(play.statYardage)>=20)explosivePasses++;
      if(run&&number(play.statYardage)>=10)explosiveRuns++;
    }
    if(!snaps)return null;
    const turnovers=stat(team,"turnovers")??((stat(team,"interceptions")??0)+(stat(team,"fumblesLost")??0));
    result[side]={snaps,explosivePasses,explosiveRuns,explosivePlays:explosivePasses+explosiveRuns,turnovers};
  }
  for(const side of ["home","away"]){
    const opponent=result[side==="home"?"away":"home"];
    result[side].explosiveAllowed=opponent.explosivePlays;
    result[side].takeaways=opponent.turnovers;
  }
  return result;
}
export async function loadPerformance(games,previous,sport){
  const old=new Map((previous.games||[]).filter(game=>game.performance).map(game=>[String(game.id),game.performance]));
  const finals=games.filter(game=>game.statusCompleted||/final/i.test(game.status||""));
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(6,finals.length)},async()=>{
    while(cursor<finals.length){
      const game=finals[cursor++];
      if(old.has(String(game.id))){game.performance=old.get(String(game.id));continue}
      try{
        const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/summary?event=${encodeURIComponent(game.id)}`);
        if(!response.ok)continue;
        const result=extractPerformance(await response.json(),game);
        if(result)game.performance=result;
      }catch{} // Missing detail must not erase cached metrics or change a projection.
    }
  }));
  const observations=new Map();
  for(const game of finals){
    if(!game.performance)continue;
    for(const side of ["home","away"]){
      const row=game.performance[side],opponent=game.performance[side==="home"?"away":"home"];
      if(!row?.snaps||!opponent?.snaps)continue;
      const entry={date:new Date(game.date),season:game.season,explosiveFor:row.explosivePlays/row.snaps,explosiveAgainst:opponent.explosivePlays/opponent.snaps,turnovers:row.turnovers,takeaways:opponent.turnovers};
      const name=game[side];
      if(!observations.has(name))observations.set(name,[]);
      observations.get(name).push(entry);
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
    return {games:sample.length,explosiveFor:blend("explosiveFor"),explosiveAgainst:blend("explosiveAgainst"),turnovers:blend("turnovers"),takeaways:blend("takeaways")};
  };
}
export function performanceAdjustment(home,away){
  if(!home||!away)return {margin:0,total:0,games:0};
  const games=Math.min(home.games,away.games);
  const credibility=limit(games/6,0,1);
  // Modest regularization: rate differences are shrunk and capped until out-of-sample calibration.
  const homeExplosive=(home.explosiveFor-away.explosiveAgainst)/2;
  const awayExplosive=(away.explosiveFor-home.explosiveAgainst)/2;
  const turnoverEdge=(away.turnovers-home.takeaways-home.turnovers+away.takeaways)/2;
  const margin=limit(((homeExplosive-awayExplosive)*18+turnoverEdge*.35)*credibility,-1.5,1.5);
  const total=limit((homeExplosive+awayExplosive)*10*credibility,-1,1);
  return {margin:Math.round(margin*100)/100,total:Math.round(total*100)/100,games};
}
