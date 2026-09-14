import { readFile, writeFile } from "node:fs/promises";

const key=process.env.ODDS_API_KEY?.trim();
if(!key){
  console.log("ODDS_API_KEY is missing; skipping NFL multi-book merge.");
  process.exit(0);
}

const clean=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const matchKey=(away,home)=>`${clean(away)}|${clean(home)}`;

const file="data/nfl.json";
const data=JSON.parse(await readFile(file,"utf8"));
const params=new URLSearchParams({
  apiKey:key,
  regions:"us,us2",
  markets:"h2h,spreads,totals",
  oddsFormat:"american",
  dateFormat:"iso"
});

const response=await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?${params}`);
const live=await response.json().catch(()=>null);
if(!response.ok||!Array.isArray(live)){
  throw new Error(`The Odds API multi-book merge failed: ${response.status} ${live?.message||""}`);
}

const liveByMatch=new Map(live.map(event=>[matchKey(event.away_team,event.home_team),event]));
let eventsUpdated=0;
let booksAdded=0;

for(const event of data.events||[]){
  const fresh=liveByMatch.get(matchKey(event.away_team,event.home_team));
  if(!fresh?.bookmakers?.length)continue;

  const books=new Map((event.bookmakers||[]).map(book=>[book.key,book]));
  const before=books.size;
  for(const book of fresh.bookmakers){
    if(!book?.key)continue;
    books.set(book.key,book);
  }
  event.bookmakers=[...books.values()].sort((a,b)=>String(a.title||a.key).localeCompare(String(b.title||b.key)));
  const added=Math.max(0,books.size-before);
  if(added){eventsUpdated++;booksAdded+=added}
}

if(eventsUpdated){
  data.updatedAt=new Date().toISOString();
  data.oddsSource=data.oddsSource?.includes("The Odds API")?data.oddsSource:`${data.oddsSource||"NFL feed"} + The Odds API multi-book merge`;
  await writeFile(file,JSON.stringify(data,null,2)+"\n");
}

console.log(`NFL sportsbook merge checked ${live.length} live events; added ${booksAdded} sportsbook entries across ${eventsUpdated} games.`);
