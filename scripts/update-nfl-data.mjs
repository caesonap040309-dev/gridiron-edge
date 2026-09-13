import { mkdir, readFile, writeFile } from "node:fs/promises";

const now=new Date();
let previous={games:[]};
try{previous=JSON.parse(await readFile("data/nfl.json","utf8"))}catch{}
const previousPredictions=new Map((previous.games||[]).filter(game=>game.prediction).map(game=>[game.id,game.prediction]));
const season=Number(process.env.SEASON||now.getUTCFullYear());
const espn="https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
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
  const params=new URLSearchParams({leagueID:"NFL",oddsAvailable:"true",includeAltLines:"false",limit:"100"});
  const response=await fetch(`https://api.sportsgameodds.com/v2/events?${params}`,{headers:{"x-api-key":key}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.success===false)throw new Error(`SportsGameOdds failed: ${response.status} ${payload.error||""}`);
  return sportsGameOddsEvents(payload.data);
}
async function fetchTheOddsApi(){
  const key=process.env.ODDS_API_KEY?.trim();
  if(!key)return [];
  const params=new URLSearchParams({apiKey:key,regions:"us,us2",markets:"h2h,spreads,totals",oddsFormat:"american",dateFormat:"iso"});
  const response=await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?${params}`);
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!Array.isArray(payload))throw new Error(`The Odds API failed: ${response.status} ${payload?.message||""}`);
  return payload;
}

for(let week=1;week<=18;week++){
  const q=new URLSearchParams({limit:"100",dates:String(season),seasontype:"2",week:String(week)});
  const response=await fetch(`${espn}?${q}`);
  if(!response.ok) throw new Error(`ESPN week ${week} failed: ${response.status}`);
  const data=await response.json();
  for(const event of data.events||[]){
    const competition=event.competitions?.[0]||{};
    const home=competition.competitors?.find(team=>team.homeAway==="home");
    const away=competition.competitors?.find(team=>team.homeAway==="away");
    const homeName=home?.team?.displayName||"TBD", awayName=away?.team?.displayName||"TBD";
    games.push({id:event.id,season,week,date:event.date,status:event.status?.type?.shortDetail,home:homeName,away:awayName,homeLogo:home?.team?.logo||null,awayLogo:away?.team?.logo||null,homeColor:home?.team?.color||null,homeAltColor:home?.team?.alternateColor||null,awayColor:away?.team?.color||null,awayAltColor:away?.team?.alternateColor||null,homeScore:home?.score,awayScore:away?.score});
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
const eventByTeams=new Map(events.map(event=>[`${cleanTeam(event.away_team)}|${cleanTeam(event.home_team)}`,event]));
function snapshotMarket(game,prediction){
  const event=eventByTeams.get(`${cleanTeam(game.away)}|${cleanTeam(game.home)}`);if(!event)return null;
  const offers=[];
  for(const book of event.bookmakers||[])for(const market of book.markets||[])for(const outcome of market.outcomes||[])offers.push({...outcome,key:market.key,book:book.title});
  const homeSpread=offers.filter(o=>o.key==="spreads"&&o.name===game.home).sort((a,b)=>(Number(b.point)-Number(a.point))||(Number(b.price)-Number(a.price)))[0];
  const over=offers.filter(o=>o.key==="totals"&&o.name==="Over").sort((a,b)=>(Number(a.point)-Number(b.point))||(Number(b.price)-Number(a.price)))[0];
  if(!homeSpread&&!over)return null;
  const projectedMargin=Number(prediction.homeScore)-Number(prediction.awayScore);
  return {capturedAt:now.toISOString(),homePoint:homeSpread?.point??null,spreadPrice:homeSpread?.price??null,spreadBook:homeSpread?.book||null,spreadPick:homeSpread?(projectedMargin+Number(homeSpread.point)>=0?game.home:game.away):null,total:over?.point??null,totalPrice:over?.price??null,totalBook:over?.book||null,totalPick:over?(Number(prediction.total)>=Number(over.point)?"Over":"Under"):null};
}
const MODEL_VERSION=3;
const LEAGUE_MEAN=22;
const HOME_FIELD=1.7;
const PRIOR_GAMES=4.5;
const RECENCY_DAYS=56;
const SPREAD_SCALE=5.7;
const TOTAL_SCALE=7.2;
const records=new Map();
const recordFor=name=>{if(!records.has(name))records.set(name,[]);return records.get(name)};
for(const game of games){
  if(!/final/i.test(game.status||""))continue;
  const homeScore=Number(game.homeScore),awayScore=Number(game.awayScore);
  if(!Number.isFinite(homeScore)||!Number.isFinite(awayScore))continue;
  const ageDays=Math.max(0,(now-new Date(game.date))/86400000);
  const weight=Math.max(.28,Math.exp(-ageDays/RECENCY_DAYS));
  recordFor(game.home).push({opponent:game.away,scored:homeScore,allowed:awayScore,weight});
  recordFor(game.away).push({opponent:game.home,scored:awayScore,allowed:homeScore,weight});
}
const ratings=new Map([...records.keys()].map(name=>[name,{offense:0,defense:0,games:records.get(name).length,for:LEAGUE_MEAN,against:LEAGUE_MEAN}]));
for(let pass=0;pass<10;pass++){
  const next=new Map();
  for(const [name,teamGames] of records){
    let off=0,def=0,weights=0,pointsFor=0,pointsAgainst=0;
    for(const result of teamGames){
      const opponent=ratings.get(result.opponent)||{offense:0,defense:0};
      const scored=Math.min(LEAGUE_MEAN*2.45,Math.max(0,result.scored));
      const allowed=Math.min(LEAGUE_MEAN*2.45,Math.max(0,result.allowed));
      off+=result.weight*((scored-LEAGUE_MEAN)+opponent.defense);
      def+=result.weight*((LEAGUE_MEAN-allowed)+opponent.offense);
      pointsFor+=result.weight*result.scored;
      pointsAgainst+=result.weight*result.allowed;
      weights+=result.weight;
    }
    next.set(name,{offense:off/(weights+PRIOR_GAMES),defense:def/(weights+PRIOR_GAMES),games:teamGames.length,for:weights?pointsFor/weights:LEAGUE_MEAN,against:weights?pointsAgainst/weights:LEAGUE_MEAN});
  }
  ratings.clear();
  for(const [name,rating] of next)ratings.set(name,rating);
}
const ratingFor=name=>ratings.get(name)||{offense:0,defense:0,games:0,for:LEAGUE_MEAN,against:LEAGUE_MEAN};
const median=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2};
function consensusMarket(game){
  const event=eventByTeams.get(`${cleanTeam(game.away)}|${cleanTeam(game.home)}`);
  if(!event)return {margin:null,total:null};
  const homePoints=[],totals=[];
  for(const book of event.bookmakers||[])for(const market of book.markets||[])for(const outcome of market.outcomes||[]){
    if(market.key==="spreads"&&outcome.name===game.home&&Number.isFinite(Number(outcome.point)))homePoints.push(Number(outcome.point));
    if(market.key==="totals"&&outcome.name==="Over"&&Number.isFinite(Number(outcome.point)))totals.push(Number(outcome.point));
  }
  const homePoint=median(homePoints);
  return {margin:homePoint==null?null:-homePoint,total:median(totals)};
}
const fairAmerican=probability=>{const p=Math.min(.995,Math.max(.005,probability/100));return Math.round(p>=.5?-100*p/(1-p):100*(1-p)/p)};
for(const game of games){
  const stored=previousPredictions.get(game.id);
  const locked=stored&&new Date(game.date)<=now;
  if(locked){game.prediction=stored;continue}
  const home=ratingFor(game.home),away=ratingFor(game.away);
  const rawHome=LEAGUE_MEAN+home.offense-away.defense+HOME_FIELD/2;
  const rawAway=LEAGUE_MEAN+away.offense-home.defense-HOME_FIELD/2;
  const rawMargin=rawHome-rawAway,rawTotal=rawHome+rawAway;
  const market=consensusMarket(game),sample=Math.min(home.games,away.games);
  const marketWeight=sample<2?.55:sample<4?.42:sample<7?.30:.20;
  const margin=market.margin==null?rawMargin:rawMargin*(1-marketWeight)+market.margin*marketWeight;
  const projectedTotal=market.total==null?rawTotal:rawTotal*(1-marketWeight)+market.total*marketWeight;
  const homePoints=Math.max(3,(projectedTotal+margin)/2),awayPoints=Math.max(3,(projectedTotal-margin)/2);
  const homeWin=Math.round((1/(1+Math.exp(-margin/8.5)))*1000)/10;
  const spreadEdge=market.margin==null?null:Math.round((margin-market.margin)*10)/10;
  const totalEdge=market.total==null?null:Math.round((projectedTotal-market.total)*10)/10;
  const homeCover=spreadEdge==null?null:Math.round((1/(1+Math.exp(-spreadEdge/SPREAD_SCALE)))*1000)/10;
  const overProb=totalEdge==null?null:Math.round((1/(1+Math.exp(-totalEdge/TOTAL_SCALE)))*1000)/10;
  const maxEdge=Math.max(Math.abs(spreadEdge||0),Math.abs(totalEdge||0));
  const confidence=sample>=6&&maxEdge>=3?"High":sample>=3?"Medium":"Low";
  const prediction={
    version:MODEL_VERSION,winner:margin>=0?game.home:game.away,homeWin,
    spread:Math.round(-margin*10)/10,total:Math.round(projectedTotal*10)/10,
    homeScore:Math.round(homePoints),awayScore:Math.round(awayPoints),sample,
    createdAt:stored?.createdAt||now.toISOString(),
    homeOffense:Math.round(home.for*10)/10,homeDefense:Math.round(home.against*10)/10,
    awayOffense:Math.round(away.for*10)/10,awayDefense:Math.round(away.against*10)/10,
    power:{homeOffense:Math.round(home.offense*10)/10,homeDefense:Math.round(home.defense*10)/10,awayOffense:Math.round(away.offense*10)/10,awayDefense:Math.round(away.defense*10)/10},
    marketMargin:market.margin,marketTotal:market.total,spreadEdge,totalEdge,homeCover,
    awayCover:homeCover==null?null:Math.round((100-homeCover)*10)/10,
    overProb,underProb:overProb==null?null:Math.round((100-overProb)*10)/10,
    fairHomeMoneyline:fairAmerican(homeWin),fairAwayMoneyline:fairAmerican(100-homeWin),confidence
  };
  prediction.market=stored?.market||snapshotMarket(game,prediction);
  game.prediction=prediction;
}
await mkdir("data",{recursive:true});
await writeFile("data/nfl.json",JSON.stringify({updatedAt:new Date().toISOString(),oddsSource:sportsGameOdds.length&&theOddsApi.length?"SportsGameOdds + The Odds API":sportsGameOdds.length?"SportsGameOdds multi-book":theOddsApi.length?"The Odds API multi-book":"ESPN market fallback",games,events},null,2)+"\n");
console.log(`Saved NFL ${games.length} games and ${events.length} markets (${sportsGameOdds.length} SportsGameOdds + ${theOddsApi.length} The Odds API events)`);
