import { mkdir, readFile, writeFile } from "node:fs/promises";

const now=new Date();
let previous={games:[]};
try{previous=JSON.parse(await readFile("data/live.json","utf8"))}catch{}
const previousPredictions=new Map((previous.games||[]).filter(game=>game.prediction).map(game=>[game.id,game.prediction]));
const season=Number(process.env.SEASON||now.getUTCFullYear());
const espn="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const games=[];
const events=[];
for(let week=1;week<=16;week++){
  const q=new URLSearchParams({limit:"100",groups:"80",dates:String(season),seasontype:"2",week:String(week)});
  const response=await fetch(`${espn}?${q}`);
  if(!response.ok) throw new Error(`ESPN week ${week} failed: ${response.status}`);
  const data=await response.json();
  for(const event of data.events||[]){
    const competition=event.competitions?.[0]||{};
    const home=competition.competitors?.find(team=>team.homeAway==="home");
    const away=competition.competitors?.find(team=>team.homeAway==="away");
    const homeName=home?.team?.displayName||"TBD", awayName=away?.team?.displayName||"TBD";
    games.push({id:event.id,season,week,date:event.date,status:event.status?.type?.shortDetail,home:homeName,away:awayName,homeScore:home?.score,awayScore:away?.score});
    const line=competition.odds?.[0];
    if(line){
      const favorite=(line.details||"").replace(/\s[-+]?[\d.]+$/,"");
      const spreadPoint=Number(line.spread);
      const homeFav=favorite&&homeName.toLowerCase().includes(favorite.toLowerCase());
      const awayFav=favorite&&awayName.toLowerCase().includes(favorite.toLowerCase());
      const homePoint=homeFav?-Math.abs(spreadPoint):awayFav?Math.abs(spreadPoint):null;
      const spreadOutcomes=homePoint==null?[]:[{name:homeName,point:homePoint,price:Number(line.pointSpread?.home?.close?.odds)||null},{name:awayName,point:-homePoint,price:Number(line.pointSpread?.away?.close?.odds)||null}];
      const total=Number(line.overUnder);
      const totalOutcomes=Number.isFinite(total)?[{name:"Over",point:total,price:Number(line.total?.over?.close?.odds)||null},{name:"Under",point:total,price:Number(line.total?.under?.close?.odds)||null}]:[];
      const moneyline=[{name:homeName,price:Number(line.moneyline?.home?.close?.odds)||null},{name:awayName,price:Number(line.moneyline?.away?.close?.odds)||null}].filter(o=>o.price!=null);
      const markets=[];
      if(spreadOutcomes.length)markets.push({key:"spreads",outcomes:spreadOutcomes});
      if(totalOutcomes.length)markets.push({key:"totals",outcomes:totalOutcomes});
      if(moneyline.length)markets.push({key:"h2h",outcomes:moneyline});
      events.push({id:event.id,commence_time:event.date,home_team:homeName,away_team:awayName,bookmakers:[{key:"espn",title:line.provider?.name||"ESPN market",markets}]});
    }
  }
}
const stats=new Map();
const statFor=name=>{if(!stats.has(name))stats.set(name,{games:0,for:0,against:0});return stats.get(name)};
for(const game of games){
  if(!/final/i.test(game.status||""))continue;
  const homeScore=Number(game.homeScore),awayScore=Number(game.awayScore);if(!Number.isFinite(homeScore)||!Number.isFinite(awayScore))continue;
  const home=statFor(game.home),away=statFor(game.away);home.games++;home.for+=homeScore;home.against+=awayScore;away.games++;away.for+=awayScore;away.against+=homeScore;
}
for(const game of games){
  const home=statFor(game.home),away=statFor(game.away);const league=27;
  const homeFor=home.games?home.for/home.games:league,homeAgainst=home.games?home.against/home.games:league;
  const awayFor=away.games?away.for/away.games:league,awayAgainst=away.games?away.against/away.games:league;
  const homePoints=Math.max(3,Math.round(((homeFor+awayAgainst)/2+1.5)*10)/10);
  const awayPoints=Math.max(3,Math.round(((awayFor+homeAgainst)/2)*10)/10);
  const margin=Math.round((homePoints-awayPoints)*10)/10,total=Math.round((homePoints+awayPoints)*10)/10;
  const homeWin=Math.round((1/(1+Math.exp(-margin/7)))*1000)/10;
  game.prediction=previousPredictions.get(game.id)||{winner:margin>=0?game.home:game.away,homeWin,spread:margin===0?0:-margin,total,homeScore:Math.round(homePoints),awayScore:Math.round(awayPoints),sample:Math.min(home.games,away.games),createdAt:now.toISOString()};
}
await mkdir("data",{recursive:true});
await writeFile("data/live.json",JSON.stringify({updatedAt:new Date().toISOString(),games,events},null,2)+"\n");
console.log(`Saved ${games.length} games and ${events.length} markets`);
