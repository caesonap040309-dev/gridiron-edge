import { mkdir, readFile, writeFile } from "node:fs/promises";

const now=new Date();
let previous={games:[]};
try{previous=JSON.parse(await readFile("data/live.json","utf8"))}catch{}
let dailyCalibration={probabilityFactor:1};
try{dailyCalibration=JSON.parse(await readFile("data/model-calibration.json","utf8")).cfb||dailyCalibration}catch{}
const previousPredictions=new Map((previous.games||[]).filter(game=>game.prediction).map(game=>[game.id,game.prediction]));
const season=Number(process.env.SEASON||now.getUTCFullYear());
const espn="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const games=[];
const events=[];
const cleanTeam=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const sportsbookIdentity=book=>String(book?.title||book?.key||"").toLowerCase().replace(/[^a-z0-9]/g,"");
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
    games.push({id:event.id,season,week,date:event.date,status:event.status?.type?.shortDetail,statusState:event.status?.type?.state||null,statusCompleted:event.status?.type?.completed===true,home:homeName,away:awayName,homeId:String(home?.team?.id||""),awayId:String(away?.team?.id||""),homeLogo:home?.team?.logo||null,awayLogo:away?.team?.logo||null,homeColor:home?.team?.color||null,homeAltColor:home?.team?.alternateColor||null,awayColor:away?.team?.color||null,awayAltColor:away?.team?.alternateColor||null,homeScore:home?.score,awayScore:away?.score,neutralSite:competition.neutralSite===true,weather:competition.weather?{temperature:Number.isFinite(Number(competition.weather.temperature))?Number(competition.weather.temperature):null,displayValue:competition.weather.displayValue||null}:null,situation:competition.situation?{possession:String(competition.situation.possession||""),downDistanceText:competition.situation.downDistanceText||null,possessionText:competition.situation.possessionText||null,yardLine:Number.isFinite(Number(competition.situation.yardLine))?Number(competition.situation.yardLine):null,lastPlay:competition.situation.lastPlay?.text||null}:null});
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
const historicalGames=[];
async function fetchHistoricalSeason(year){
  const collected=[];
  const maxWeek=16;
  for(let week=1;week<=maxWeek;week++){
    const q=new URLSearchParams({limit:"100",groups:"80",dates:String(year),seasontype:"2",week:String(week)});
    const response=await fetch(`${espn}?${q}`);
    if(!response.ok){console.error(`Historical season ${year} week ${week} failed: ${response.status}`);continue}
    const data=await response.json();
    for(const event of data.events||[]){
      const competition=event.competitions?.[0]||{};
      const home=competition.competitors?.find(team=>team.homeAway==="home");
      const away=competition.competitors?.find(team=>team.homeAway==="away");
      const homeScore=Number(home?.score),awayScore=Number(away?.score);
      if(!Number.isFinite(homeScore)||!Number.isFinite(awayScore)||!/final/i.test(event.status?.type?.shortDetail||""))continue;
      collected.push({id:event.id,season:year,week,date:event.date,status:"Final",home:home?.team?.displayName||"TBD",away:away?.team?.displayName||"TBD",homeScore,awayScore});
    }
  }
  return collected;
}
for(const year of [season-1,season-2]){
  const seasonGames=await fetchHistoricalSeason(year);
  historicalGames.push(...seasonGames);
  console.log(`Loaded ${seasonGames.length} historical games from ${year}`);
}

const [sportsGameOdds,theOddsApi]=await Promise.all([
  fetchSportsGameOdds().catch(error=>(console.error(error.message),[])),
  fetchTheOddsApi().catch(error=>(console.error(error.message),[]))
]);
const multiBookEvents=[...sportsGameOdds,...theOddsApi];
const freshSportsbooks=new Set(multiBookEvents.flatMap(event=>(event.bookmakers||[]).map(sportsbookIdentity)));
const hasFreshMultiBook=freshSportsbooks.size>1;
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
// Odds providers commonly remove a matchup once it starts. Preserve the last
// successfully collected pregame prices instead of replacing them with a
// single ESPN line on the next refresh.
let usedCachedMultiBook=false;
if(Array.isArray(previous.events)){
  const previousByMatch=new Map(previous.events.map(event=>[`${cleanTeam(event.away_team)}|${cleanTeam(event.home_team)}`,event]));
  for(let index=0;index<events.length;index++){
    const event=events[index],cached=previousByMatch.get(`${cleanTeam(event.away_team)}|${cleanTeam(event.home_team)}`);
    if(!cached?.bookmakers?.length)continue;
    const books=new Map((event.bookmakers||[]).map(book=>[sportsbookIdentity(book),book]));
    const before=books.size;
    for(const book of cached.bookmakers)if(!books.has(sportsbookIdentity(book)))books.set(sportsbookIdentity(book),book);
    if(books.size>before){events[index]={...event,bookmakers:[...books.values()]};usedCachedMultiBook=true}
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
const MODEL_VERSION=6;
const LEAGUE_MEAN=27;
const HOME_FIELD=2.7;
const PRIOR_GAMES=3.5;
const RECENCY_DAYS=70;
const SPREAD_SCALE=6.8;
const TOTAL_SCALE=8.5;
const records=new Map();
const recordFor=name=>{if(!records.has(name))records.set(name,[]);return records.get(name)};
for(const game of [...games,...historicalGames]){
  if(!/final/i.test(game.status||""))continue;
  const homeScore=Number(game.homeScore),awayScore=Number(game.awayScore);
  if(!Number.isFinite(homeScore)||!Number.isFinite(awayScore))continue;
  const ageDays=Math.max(0,(now-new Date(game.date))/86400000);
  const seasonWeight=Math.pow(.45,Math.max(0,season-Number(game.season||season)));
  const weight=Math.max(.28,Math.exp(-ageDays/RECENCY_DAYS))*seasonWeight;
  recordFor(game.home).push({opponent:game.away,scored:homeScore,allowed:awayScore,weight,date:game.date,site:"home"});
  recordFor(game.away).push({opponent:game.home,scored:awayScore,allowed:homeScore,weight,date:game.date,site:"away"});
}
const ratings=new Map([...records.keys()].map(name=>[name,{offense:0,defense:0,games:records.get(name).length,effectiveGames:0,for:LEAGUE_MEAN,against:LEAGUE_MEAN}]));
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
    next.set(name,{offense:off/(weights+PRIOR_GAMES),defense:def/(weights+PRIOR_GAMES),games:teamGames.length,effectiveGames:weights,for:weights?pointsFor/weights:LEAGUE_MEAN,against:weights?pointsAgainst/weights:LEAGUE_MEAN});
  }
  ratings.clear();
  for(const [name,rating] of next)ratings.set(name,rating);
}
const ratingFor=name=>ratings.get(name)||{offense:0,defense:0,games:0,effectiveGames:0,for:LEAGUE_MEAN,against:LEAGUE_MEAN};
const median=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2};
const deviation=values=>{const clean=values.filter(Number.isFinite);if(clean.length<2)return 0;const mean=clean.reduce((sum,value)=>sum+value,0)/clean.length;return Math.sqrt(clean.reduce((sum,value)=>sum+(value-mean)**2,0)/clean.length)};
const cap=(value,min,max)=>Math.min(max,Math.max(min,value));
function teamContext(name,site,beforeDate){
  const prior=(records.get(name)||[]).filter(result=>new Date(result.date)<beforeDate).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const venue=prior.filter(result=>result.site===site);
  const venueWeight=venue.reduce((sum,result)=>sum+result.weight,0);
  const venueMargin=venue.reduce((sum,result)=>sum+result.weight*(result.scored-result.allowed),0)/(venueWeight+3);
  const lastDate=prior[0]?.date?new Date(prior[0].date):null;
  const restDays=lastDate?Math.max(0,(beforeDate-lastDate)/86400000):null;
  const recent=prior.slice(0,5),recentWeight=recent.reduce((sum,result)=>sum+result.weight,0);
  const recentMargin=recent.reduce((sum,result)=>sum+result.weight*(result.scored-result.allowed),0)/(recentWeight+2.5);
  return {venueMargin,restDays,recentGames:recent.length,recentMargin};
}
function matchupContext(home,away,beforeDate){
  const meetings=[...historicalGames,...games].filter(game=>/final/i.test(game.status||"")&&new Date(game.date)<beforeDate&&[game.home,game.away].includes(home)&&[game.home,game.away].includes(away)).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  let margin=0,total=0,weight=0;
  for(const game of meetings){const age=Math.max(0,(beforeDate-new Date(game.date))/86400000),w=Math.exp(-age/500),homePoints=game.home===home?Number(game.homeScore):Number(game.awayScore),awayPoints=game.home===home?Number(game.awayScore):Number(game.homeScore);if(!Number.isFinite(homePoints)||!Number.isFinite(awayPoints))continue;margin+=w*(homePoints-awayPoints);total+=w*(homePoints+awayPoints);weight+=w}
  return {games:meetings.length,margin:weight?cap((margin/weight)*.08,-1.25,1.25):0,total:weight?cap(((total/weight)-LEAGUE_MEAN*2)*.06,-.75,.75):0};
}
function weatherAdjustment(game){
  const text=String(game.weather?.displayValue||"").toLowerCase();
  const temperature=Number(game.weather?.temperature);
  const wind=Number(text.match(/(\d+(?:\.\d+)?)\s*mph/)?.[1]);
  let total=0;
  if(Number.isFinite(wind)&&wind>=15)total-=wind>=25?3.5:2;
  if(/rain|snow|sleet|storm/.test(text))total-=1.25;
  if(Number.isFinite(temperature)&&temperature<=32)total-=0.75;
  return Math.round(total*10)/10;
}
function consensusMarket(game){
  const event=eventByTeams.get(`${cleanTeam(game.away)}|${cleanTeam(game.home)}`);
  if(!event)return {margin:null,total:null};
  const homePoints=[],totals=[];
  for(const book of event.bookmakers||[])for(const market of book.markets||[])for(const outcome of market.outcomes||[]){
    if(market.key==="spreads"&&outcome.name===game.home&&Number.isFinite(Number(outcome.point)))homePoints.push(Number(outcome.point));
    if(market.key==="totals"&&outcome.name==="Over"&&Number.isFinite(Number(outcome.point)))totals.push(Number(outcome.point));
  }
  const homePoint=median(homePoints);
  return {margin:homePoint==null?null:-homePoint,total:median(totals),spreadDeviation:deviation(homePoints),totalDeviation:deviation(totals),bookCount:new Set((event.bookmakers||[]).map(book=>book.key)).size};
}

const INJURY_POSITION_POINTS={QB:5.5,LT:1.15,RT:1.0,OL:0.85,G:0.75,C:0.8,WR:1.25,RB:0.85,TE:0.7,DE:0.75,DT:0.65,DL:0.65,LB:0.7,CB:0.95,S:0.8,DB:0.8,K:0.35,P:0.15};
const INJURY_AVAILABILITY={out:0,ir:0,pup:0,suspended:0,doubtful:.2,questionable:.55,limited:.78,probable:.9,active:1,full:1};
function injuryStatus(item){
  return String(item?.status||item?.type?.description||item?.type?.name||item?.details?.type||item?.details?.detail||"unknown").toLowerCase();
}
function availabilityFor(status){
  const key=Object.keys(INJURY_AVAILABILITY).find(name=>status.includes(name));
  return key?INJURY_AVAILABILITY[key]:.72;
}
function normalizeInjuries(summary,game){
  const output={home:[],away:[],updatedAt:new Date().toISOString(),source:"ESPN"};
  const groups=Array.isArray(summary?.injuries)?summary.injuries:[];
  for(const group of groups){
    const team=group?.team||group?.competitor?.team||{};
    const teamName=team.displayName||team.name||group?.displayName||"";
    const teamId=String(team.id||group?.teamId||"");
    const side=teamId&&teamId===String(game.homeId)?"home":teamId&&teamId===String(game.awayId)?"away":cleanTeam(teamName)===cleanTeam(game.home)?"home":cleanTeam(teamName)===cleanTeam(game.away)?"away":null;
    if(!side)continue;
    const items=group?.injuries||group?.items||[];
    for(const item of items){
      const athlete=item?.athlete||{};
      const status=injuryStatus(item);
      const position=String(athlete?.position?.abbreviation||item?.position?.abbreviation||item?.position||"").toUpperCase();
      const base=INJURY_POSITION_POINTS[position]??.55;
      const availability=availabilityFor(status);
      const expectedLoss=Math.round(base*(1-availability)*100)/100;
      output[side].push({name:athlete.displayName||athlete.fullName||item?.displayName||"Unknown player",position:position||"—",status:item?.status||item?.type?.description||item?.details?.type||"Unknown",detail:item?.details?.detail||item?.longComment||null,availability:Math.round(availability*100),impact:base,expectedLoss});
    }
  }
  return output;
}
async function refreshInjuries(game){
  const kickoff=new Date(game.date);
  if(game.statusCompleted||kickoff<new Date(now.getTime()-86400000)||kickoff>new Date(now.getTime()+21*86400000))return;
  try{
    const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${encodeURIComponent(game.id)}`);
    if(!response.ok)throw new Error(`injury feed ${response.status}`);
    const summary=await response.json();
    const injuries=normalizeInjuries(summary,game);
    const count=injuries.home.length+injuries.away.length;
    game.injuries=count?injuries:((previous.games||[]).find(old=>String(old.id)===String(game.id))?.injuries||injuries);
  }catch{
    game.injuries=(previous.games||[]).find(old=>String(old.id)===String(game.id))?.injuries||{home:[],away:[],updatedAt:null,source:"Unavailable"};
  }
}
function injuryAdjustment(game){
  const home=game.injuries?.home||[],away=game.injuries?.away||[];
  const loss=list=>Math.min(7,list.reduce((sum,item)=>sum+(Number(item.expectedLoss)||0),0));
  const uncertainty=list=>list.reduce((sum,item)=>{const p=(Number(item.availability)||0)/100;return sum+(Number(item.impact)||.55)*4*p*(1-p)},0);
  const homeLoss=loss(home),awayLoss=loss(away);
  return {homeLoss,awayLoss,margin:cap(awayLoss-homeLoss,-7,7),total:cap(-(homeLoss+awayLoss)*.16,-2.5,0),uncertainty:cap(uncertainty(home)+uncertainty(away),0,5),homeCount:home.length,awayCount:away.length,updatedAt:game.injuries?.updatedAt||null};
}
await Promise.all(games.map(refreshInjuries));

const fairAmerican=probability=>{const p=Math.min(.995,Math.max(.005,probability/100));return Math.round(p>=.5?-100*p/(1-p):100*(1-p)/p)};
for(const game of games){
  const stored=previousPredictions.get(game.id);
  const locked=stored&&new Date(game.date)<=now;
  if(locked){game.prediction=stored;continue}
  const home=ratingFor(game.home),away=ratingFor(game.away);
  const kickoff=new Date(game.date),homeContext=teamContext(game.home,"home",kickoff),awayContext=teamContext(game.away,"away",kickoff);
  const homeField=game.neutralSite?0:HOME_FIELD;
  const rawHome=LEAGUE_MEAN+home.offense-away.defense+homeField/2;
  const rawAway=LEAGUE_MEAN+away.offense-home.defense-homeField/2;
  const restDifference=homeContext.restDays!=null&&awayContext.restDays!=null?cap(homeContext.restDays-awayContext.restDays,-7,7):0;
  const restAdjustment=restDifference*.08;
  const venueAdjustment=cap((homeContext.venueMargin-awayContext.venueMargin)*.12,-2,2);
  const formAdjustment=cap((homeContext.recentMargin-awayContext.recentMargin)*.08,-1.5,1.5);
  const matchup=matchupContext(game.home,game.away,kickoff);
  const injury=injuryAdjustment(game);
  const rawMargin=rawHome-rawAway+restAdjustment+venueAdjustment+formAdjustment+matchup.margin+injury.margin;
  const weatherTotalAdjustment=weatherAdjustment(game);
  const rawTotal=rawHome+rawAway+weatherTotalAdjustment+matchup.total+injury.total;
  const market=consensusMarket(game),sample=Math.round(Math.min(home.effectiveGames,away.effectiveGames)*10)/10;
  const observedGames=Math.min(home.games||0,away.games||0);
  const evidenceGames=Math.round(Math.max(sample,Math.min(8,observedGames*.35))*10)/10;
  const baseMarketWeight=sample<2?.55:sample<4?.42:sample<7?.30:.20;
  const marketWeight=Math.min(.62,baseMarketWeight+(market.bookCount>=4?.08:market.bookCount>=2?.04:0));
  const margin=market.margin==null?rawMargin:rawMargin*(1-marketWeight)+market.margin*marketWeight;
  const projectedTotal=market.total==null?rawTotal:rawTotal*(1-marketWeight)+market.total*marketWeight;
  const homePoints=Math.max(3,(projectedTotal+margin)/2),awayPoints=Math.max(3,(projectedTotal-margin)/2);
  const injuryReliability=Math.max(.78,1-injury.uncertainty*.04);
  const reliability=cap((.55+Math.min(sample,8)*.04+Math.min(market.bookCount||0,4)*.03)*cap(Number(dailyCalibration.probabilityFactor)||1,.8,1.08)*injuryReliability,.5,.95);
  const rawHomeWin=(1/(1+Math.exp(-margin/10.5)))*100;
  const homeWin=Math.round((50+(rawHomeWin-50)*reliability)*10)/10;
  const spreadEdge=market.margin==null?null:Math.round((margin-market.margin)*10)/10;
  const totalEdge=market.total==null?null:Math.round((projectedTotal-market.total)*10)/10;
  const homeCover=spreadEdge==null?null:Math.round((50+(((1/(1+Math.exp(-spreadEdge/SPREAD_SCALE)))*100)-50)*reliability)*10)/10;
  const overProb=totalEdge==null?null:Math.round((50+(((1/(1+Math.exp(-totalEdge/TOTAL_SCALE)))*100)-50)*reliability)*10)/10;
  const maxEdge=Math.max(Math.abs(spreadEdge||0),Math.abs(totalEdge||0));
  const marketStable=(market.spreadDeviation||0)<=1.25&&(market.totalDeviation||0)<=1.75;
  // Overall matchup confidence is not the same as sportsbook edge. The model
  // blends toward consensus prices, so requiring a large post-blend edge made
  // nearly every refreshed game Low even when the winner signal was strong.
  const winSignal=Math.abs(homeWin-50);
  const strongSignal=winSignal>=12||maxEdge>=3.5;
  const mediumSignal=winSignal>=6||maxEdge>=1.5;
  const marketEvidenceOkay=market.bookCount===0||marketStable;
  const highMarketEvidence=market.bookCount===0||market.bookCount>=2;
  const confidence=evidenceGames>=5&&reliability>=.76&&injury.uncertainty<2.5&&marketEvidenceOkay&&highMarketEvidence&&strongSignal?"High":evidenceGames>=2&&reliability>=.64&&injury.uncertainty<4&&marketEvidenceOkay&&mediumSignal?"Medium":"Low";
  const signalScore=Math.max(Math.min(1,winSignal/18),Math.min(1,maxEdge/4));
  const evidenceScore=Math.min(1,evidenceGames/6)*.45+Math.min(1,(market.bookCount||0)/3)*.25+(marketStable?.15:0)+reliability*.15;
  const confidenceScore=Math.round(cap((signalScore*.58+evidenceScore*.42-Math.min(.25,injury.uncertainty*.05))*100,0,100));
  const prediction={
    version:MODEL_VERSION,winner:margin>=0?game.home:game.away,homeWin,
    spread:Math.round(-margin*10)/10,total:Math.round(projectedTotal*10)/10,
    homeScore:Math.round(homePoints),awayScore:Math.round(awayPoints),sample,evidenceGames,observedGames,
    createdAt:stored?.createdAt||now.toISOString(),
    homeOffense:Math.round(home.for*10)/10,homeDefense:Math.round(home.against*10)/10,
    awayOffense:Math.round(away.for*10)/10,awayDefense:Math.round(away.against*10)/10,
    power:{homeOffense:Math.round(home.offense*10)/10,homeDefense:Math.round(home.defense*10)/10,awayOffense:Math.round(away.offense*10)/10,awayDefense:Math.round(away.defense*10)/10},
    marketMargin:market.margin,marketTotal:market.total,marketBooks:market.bookCount||0,marketSpreadDeviation:Math.round((market.spreadDeviation||0)*10)/10,marketTotalDeviation:Math.round((market.totalDeviation||0)*10)/10,spreadEdge,totalEdge,homeCover,
    adjustments:{neutralSite:game.neutralSite===true,homeField:Math.round(homeField*10)/10,rest:Math.round(restAdjustment*10)/10,venue:Math.round(venueAdjustment*10)/10,recentForm:Math.round(formAdjustment*10)/10,headToHead:Math.round(matchup.margin*10)/10,weatherTotal:weatherTotalAdjustment,injuryMargin:Math.round(injury.margin*10)/10,injuryTotal:Math.round(injury.total*10)/10},injuryImpact:{homeLoss:Math.round(injury.homeLoss*10)/10,awayLoss:Math.round(injury.awayLoss*10)/10,uncertainty:Math.round(injury.uncertainty*10)/10,homeCount:injury.homeCount,awayCount:injury.awayCount,updatedAt:injury.updatedAt},calibration:{reliability:Math.round(reliability*1000)/10,effectiveSample:sample,dailyFactor:Number(dailyCalibration.probabilityFactor)||1},
    awayCover:homeCover==null?null:Math.round((100-homeCover)*10)/10,
    overProb,underProb:overProb==null?null:Math.round((100-overProb)*10)/10,
    fairHomeMoneyline:fairAmerican(homeWin),fairAwayMoneyline:fairAmerican(100-homeWin),confidence,confidenceScore,reliability:Math.round(reliability*1000)/1000
  };
  const teamHistory=[...historicalGames,...games.filter(item=>item.id!==game.id&&/final/i.test(item.status||""))];
  const relevant=teamHistory.filter(item=>item.home===game.home||item.away===game.home||item.home===game.away||item.away===game.away);
  const headToHead=relevant.filter(item=>[item.home,item.away].includes(game.home)&&[item.home,item.away].includes(game.away));
  const homeHistoricalGames=relevant.filter(item=>item.home===game.home||item.away===game.home).length;
  const awayHistoricalGames=relevant.filter(item=>item.home===game.away||item.away===game.away).length;
  prediction.history={seasons:[season-2,season-1,season],homeGames:homeHistoricalGames,awayGames:awayHistoricalGames,headToHead:headToHead.length,headToHeadAverageTotal:headToHead.length?Math.round(headToHead.reduce((sum,item)=>sum+Number(item.homeScore)+Number(item.awayScore),0)/headToHead.length*10)/10:null};
  prediction.market=stored?.market||snapshotMarket(game,prediction);
  game.prediction=prediction;
}
await mkdir("data",{recursive:true});
const confidenceDistribution=games.reduce((counts,game)=>{const level=game.prediction?.confidence||"Missing";counts[level]=(counts[level]||0)+1;return counts},{High:0,Medium:0,Low:0,Missing:0});
const confidenceSamples=games.filter(game=>game.prediction&&new Date(game.date)>now).slice(0,12).map(game=>({game:`${game.away} at ${game.home}`,confidence:game.prediction.confidence,confidenceScore:game.prediction.confidenceScore,sample:game.prediction.sample,evidenceGames:game.prediction.evidenceGames,observedGames:game.prediction.observedGames,reliability:game.prediction.reliability,homeWin:game.prediction.homeWin,marketBooks:game.prediction.marketBooks,spreadEdge:game.prediction.spreadEdge,totalEdge:game.prediction.totalEdge,injuryUncertainty:game.prediction.injuryImpact?.uncertainty??null}));
const sportsbookNames=[...new Set(events.flatMap(event=>(event.bookmakers||[]).map(book=>book.title||book.key)))].sort();
const oddsSource=hasFreshMultiBook?(sportsGameOdds.length&&theOddsApi.length?"SportsGameOdds + The Odds API":sportsGameOdds.length?"SportsGameOdds multi-book":"The Odds API multi-book"):usedCachedMultiBook?"Last available multi-book lines + ESPN fallback":"ESPN market fallback";
await writeFile("data/model-health-cfb.json",JSON.stringify({updatedAt:new Date().toISOString(),confidenceDistribution,confidenceSamples},null,2)+"\n");
await writeFile("data/live.json",JSON.stringify({updatedAt:new Date().toISOString(),modelHealth:{confidenceDistribution,confidenceSamples},multiBookUpdatedAt:hasFreshMultiBook?new Date().toISOString():(previous.multiBookUpdatedAt||previous.updatedAt||null),oddsSource,feedHealth:{multiBookLive:hasFreshMultiBook,usedCachedMultiBook,sportsbookCount:sportsbookNames.length,sportsbooks:sportsbookNames},games,events},null,2)+"\n");
console.log(`Saved ${games.length} games and ${events.length} markets (${sportsGameOdds.length} SportsGameOdds + ${theOddsApi.length} The Odds API events)`);
