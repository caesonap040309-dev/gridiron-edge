import { mkdir, writeFile } from "node:fs/promises";

const key=process.env.ODDS_API_KEY;
if(!key) throw new Error("Missing ODDS_API_KEY repository secret");
const now=new Date();
const season=Number(process.env.SEASON||now.getUTCFullYear());
const espn="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const games=[];
for(let week=1;week<=16;week++){
  const q=new URLSearchParams({limit:"100",groups:"80",dates:String(season),seasontype:"2",week:String(week)});
  const response=await fetch(`${espn}?${q}`);
  if(!response.ok) throw new Error(`ESPN week ${week} failed: ${response.status}`);
  const data=await response.json();
  for(const event of data.events||[]){
    const competition=event.competitions?.[0]||{};
    const home=competition.competitors?.find(team=>team.homeAway==="home");
    const away=competition.competitors?.find(team=>team.homeAway==="away");
    games.push({id:event.id,season,week,date:event.date,status:event.status?.type?.shortDetail,home:home?.team?.displayName||"TBD",away:away?.team?.displayName||"TBD",homeScore:home?.score,awayScore:away?.score});
  }
}
const oq=new URLSearchParams({apiKey:key,regions:"us",markets:"h2h,spreads,totals",oddsFormat:"american",dateFormat:"iso"});
const oddsResponse=await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds?${oq}`);
if(!oddsResponse.ok) throw new Error(`The Odds API failed: ${oddsResponse.status} ${await oddsResponse.text()}`);
const events=await oddsResponse.json();
await mkdir("data",{recursive:true});
await writeFile("data/live.json",JSON.stringify({updatedAt:new Date().toISOString(),games,events},null,2)+"\n");
console.log(`Saved ${games.length} games and ${events.length} odds events`);
