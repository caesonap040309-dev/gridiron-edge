import {readFile,writeFile,mkdir} from "node:fs/promises";
import {pathToFileURL} from "node:url";

const API="https://gamma-api.polymarket.com";
const clean=value=>String(value||"").toLowerCase().replace(/\b(the|university|college)\b/g,"").replace(/[^a-z0-9]/g,"");
const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null};
const json=value=>{if(Array.isArray(value))return value;try{return JSON.parse(value)}catch{return[]}};

function namedTeam(team){return team?.name||team?.title||team?.team||team?.abbreviation||null}
function teamsFor(event){
  const teams=event?.sports?.teams||event?.teams||[];
  const home=teams.find(team=>String(team?.ordering||team?.designation||team?.homeAway).toLowerCase()==="home");
  const away=teams.find(team=>String(team?.ordering||team?.designation||team?.homeAway).toLowerCase()==="away");
  if(namedTeam(home)&&namedTeam(away))return{home:namedTeam(home),away:namedTeam(away)};
  const title=String(event?.title||event?.question||"");
  const parts=title.split(/\s+(?:vs\.?|at|@)\s+/i);
  return parts.length===2?{away:parts[0].trim(),home:parts[1].replace(/\s+-.*$/,"").trim()}:{};
}

export function normalizePolymarketEvent(event,league){
  const {home,away}=teamsFor(event);if(!home||!away)return null;
  const markets=(event.markets||[]).filter(m=>m?.active!==false&&m?.closed!==true);
  const moneyline=markets.find(m=>String(m.sportsMarketType||m?.sports?.sportsMarketType||"").toLowerCase()==="moneyline")||markets.find(m=>/moneyline|\bwin\b|winner/i.test(`${m.question||""} ${m.slug||""}`));
  if(!moneyline)return null;
  const outcomes=json(moneyline.outcomes),prices=json(moneyline.outcomePrices).map(number);
  let homeIndex=outcomes.findIndex(outcome=>clean(outcome)===clean(home)||clean(outcome).includes(clean(home))||clean(home).includes(clean(outcome)));
  if(homeIndex<0&&outcomes.length===2&&/^will\b/i.test(moneyline.question||"")&&clean(moneyline.question).includes(clean(home)))homeIndex=outcomes.findIndex(outcome=>/^yes$/i.test(outcome));
  const homeProbability=homeIndex>=0?number(prices[homeIndex]):null;
  if(homeProbability==null||homeProbability<0||homeProbability>1)return null;
  const slug=event.slug||moneyline.slug;
  return{league,home,away,homeProbability:Math.round(homeProbability*1000)/10,awayProbability:Math.round((1-homeProbability)*1000)/10,volume:number(moneyline.volume??event.volume),volume24h:number(moneyline.volume24hr??moneyline.volume24h??event.volume24hr),liquidity:number(moneyline.liquidity??event.liquidity),capturedAt:new Date().toISOString(),startTime:event.startDate||event.startTime||moneyline.endDate||null,source:"Polymarket",marketUrl:slug?`https://polymarket.com/event/${slug}`:null};
}

async function get(path){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(`${API}${path}`,{headers:{accept:"application/json","user-agent":"GridironEdge/1.0"},signal:controller.signal});if(!response.ok)throw Error(`${path} returned ${response.status}`);return response.json()}finally{clearTimeout(timer)}}
async function eventsForFilter(key,value){
  const all=[];const limit=500;
  for(let page=0;page<5;page++){
    const query=new URLSearchParams({[key]:String(value),active:"true",closed:"false",limit:String(limit),offset:String(page*limit)});
    const data=await get(`/events?${query}`),items=Array.isArray(data)?data:data.events||data.items||[];all.push(...items);
    if(!items.length||items.length<limit||data.has_more===false)break;
  }
  return all;
}

async function eventsForSport(sport){
  const requests=[];
  for(const seriesId of String(sport.series||"").split(",").filter(Boolean))requests.push(eventsForFilter("series_id",seriesId));
  const tagIds=new Set([sport.primaryTagId]);
  if(String(sport.sport||"").toLowerCase()==="cfb")tagIds.add(10210);
  for(const tagId of tagIds)if(tagId)requests.push(eventsForFilter("tag_id",tagId));
  const events=(await Promise.all(requests)).flat(),seen=new Set();
  return events.filter(event=>{const key=event.id||event.slug;if(!key||seen.has(key))return false;seen.add(key);return true});
}

export async function updatePredictionMarkets(){
  const sports=await get("/sports"),wanted=(sports||[]).filter(s=>["nfl","ncaaf","cfb"].includes(String(s.sport||"").toLowerCase())||/college football/i.test(s.name||""));
  const collected=[];
  for(const sport of wanted){
    const events=await eventsForSport(sport);
    const league=String(sport.sport||"").toLowerCase()==="nfl"?"NFL":"College Football";
    collected.push(...events.map(event=>normalizePolymarketEvent(event,league)).filter(Boolean));
  }
  await mkdir("data",{recursive:true});
  await writeFile("data/prediction-markets.json",JSON.stringify({updatedAt:new Date().toISOString(),source:"Polymarket public Gamma API",games:collected},null,2)+"\n");
  console.log(`Saved ${collected.length} Polymarket football moneylines`);
  return collected;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  updatePredictionMarkets().catch(async error=>{let existing=false;try{JSON.parse(await readFile("data/prediction-markets.json","utf8"));existing=true}catch{}console.error(`Polymarket refresh unavailable: ${error.message}`);if(!existing)process.exitCode=1});
}
