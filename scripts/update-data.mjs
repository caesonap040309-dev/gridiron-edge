import { mkdir, readFile, writeFile } from "node:fs/promises";

const now=new Date();
let previous={games:[]};
try{previous=JSON.parse(await readFile("data/live.json","utf8"))}catch{}
const previousPredictions=new Map((previous.games||[]).filter(game=>game.prediction).map(game=>[game.id,game.prediction]));
const season=Number(process.env.SEASON||now.getUTCFullYear());
const espn="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const games=[];
const events=[];
const cleanTeam=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const num=value=>{const parsed=Number(String(value??"").replace("+",""));return Number.isFinite(parsed)?parsed:null};
const teamName=(event,side)=>event.teams?.[side]?.names?.long||event.teams?.[side]?.name||event.teams?.[side]?.names?.medium||side;
const marketPoint=(odd,quote)=>num(quote?.spread??quote?.overUnder??odd?.bookSpread??odd?.bookOverUnder);

function sportsGameOddsEvents(rawEvents){
  return (rawEvents||[]).map(event=>{
    const home=teamName(event,"home"),away=teamName(event,"away");
    const books=new Map();
    for(const odd of Object.values(event.odds||{})){
      if(odd.periodID!=="game"||!["ml","sp","ou"].includes(odd.betTypeID))continue;
      const marketKey={ml:"h2h",sp:"spreads",ou:"totals"}[odd.betTypeID];
      for(const [bookKey,quote] of Object.entries(odd.byBookmaker||{})){
        if(quote?.available===false)continue;
        if(!books.has(bookKey))books.set(bookKey,{key:bookKey,title:quote?.bookmakerName||bookKey.replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase()),markets:new Map()});
        const book=books.get(bookKey);
        if(!book.markets.has(marketKey))book.markets.set(marketKey,[]);
        const name=odd.betTypeID==="ou"?(odd.sideID==="over"?"Over":"Under"):(odd.sideID==="home"?home:away);
        const point=odd.betTypeID==="ml"?undefined:marketPoint(odd,quote);
        const price=num(quote.odds??odd.bookOdds);
        if(price!=null&&(odd.betTypeID==="ml"||point!=null))book.markets.get(marketKey).push({name,...(point==null?{}:{point}),price});
      }
    }
    return {id:event.eventID,commence_time:event.status?.startsAt,home_team:home,away_team:away,bookmakers:[...books.values()].map(book=>({...book,markets:[...book.markets].map(([key,outcomes])=>({key,outcomes}))}))};
  }).filter(event=>event.bookmakers.length);
}

async function fetchSportsGameOdds(){
  const key=process.env.SPORTSGAMEODDS_API_KEY?.trim();
  if(!key)return [];
  const params=new URLSearchParams({leagueID:"NCAAF",oddsAvailable:"true",includeAltLines:"false",limit:"100"});
  const response=await fetch(`https://api.sportsgameodds.com/v2/events?${params}`,{headers:{"x-api-key":key}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.success===false)throw new Error(`SportsGameOdds failed: ${response.status} ${payload.error||""}`);
  return sportsGameOddsEvents(payload.data);
}
async function fetchTheOddsApi(){
  const key=process.env.ODDS_API_KEY?.trim();
  if(!key)return [];
  const params=new URLSearchParams({apiKey:key,regions:"us,us2",markets:"h2h,spreads,totals",oddsFormat:"american",dateFormat:"iso"});
  const response=await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds/?${params}`);
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!Array.isArray(payload))throw new Error(`The Odds API failed: ${response.status} ${payload?.message||""}`);
  return payload;
}

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
    games.push({id:event.id,season,week,date:event.date,status:event.status?.type?.shortDetail,home:homeName,away:awayName,homeLogo:home?.team?.logo||null,awayLogo:away?.team?.logo||null,homeScore:home?.score,awayScore:away?.score});
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
const [sportsGameOdds,theOddsApi]=await Promise.all([
  fetchSportsGameOdds().catch(error=>(console.error(error.message),[])),
  fetchTheOddsApi().catch(error=>(console.error(error.message),[]))
]);
const multiBookEvents=[...sportsGameOdds,...theOddsApi];
if(multiBookEvents.length){
  const byMatch=new Map(events.map((event,index)=>[`${cleanTeam(event.away_team)}|${cleanTeam(event.home_team)}`,index]));
  for(const event of multiBookEvents){
    const key=`${cleanTeam(event.away_team)}|${cleanTeam(event.home_team)}`;
    const index=byMatch.get(key);
    if(index==null){byMatch.set(key,events.length);events.push(event);continue}
    const current=events[index];
    const books=new Map((current.bookmakers||[]).map(book=>[book.key,book]));
    for(const book of event.bookmakers||[])books.set(book.key,book);
    events[index]={...current,bookmakers:[...books.values()]};
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
  const stored=previousPredictions.get(game.id);
  if(stored&&!stored.createdAt&&new Date(game.date)>now)stored.createdAt=now.toISOString();
  game.prediction=stored||{winner:margin>=0?game.home:game.away,homeWin,spread:margin===0?0:-margin,total,homeScore:Math.round(homePoints),awayScore:Math.round(awayPoints),sample:Math.min(home.games,away.games),createdAt:now.toISOString()};
}
await mkdir("data",{recursive:true});
await writeFile("data/live.json",JSON.stringify({updatedAt:new Date().toISOString(),oddsSource:sportsGameOdds.length&&theOddsApi.length?"SportsGameOdds + The Odds API":sportsGameOdds.length?"SportsGameOdds multi-book":theOddsApi.length?"The Odds API multi-book":"ESPN market fallback",games,events},null,2)+"\n");
console.log(`Saved ${games.length} games and ${events.length} markets (${sportsGameOdds.length} SportsGameOdds + ${theOddsApi.length} The Odds API events)`);
