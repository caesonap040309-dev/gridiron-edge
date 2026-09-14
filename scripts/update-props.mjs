import { mkdir, writeFile } from "node:fs/promises";

const apiKey=process.env.ODDS_API_KEY?.trim();
const now=new Date();
const PROP_MARKETS=[
  "player_pass_yds","player_pass_tds","player_pass_completions","player_pass_attempts","player_pass_interceptions",
  "player_rush_yds","player_rush_attempts","player_reception_yds","player_receptions",
  "player_rush_reception_yds","player_rush_tds","player_reception_tds","player_anytime_td",
  "player_fantasy_points"
];
const MARKET_LABELS={
  player_pass_yds:"Passing yards",player_pass_tds:"Passing TDs",player_pass_completions:"Pass completions",player_pass_attempts:"Pass attempts",player_pass_interceptions:"Interceptions thrown",
  player_rush_yds:"Rushing yards",player_rush_attempts:"Rush attempts",player_reception_yds:"Receiving yards",player_receptions:"Receptions",
  player_rush_reception_yds:"Rush + receiving yards",player_rush_tds:"Rushing TDs",player_reception_tds:"Receiving TDs",player_anytime_td:"Anytime TD",
  player_fantasy_points:"Fantasy points"
};
const CATEGORY={
  player_pass_yds:"Passing",player_pass_tds:"Passing",player_pass_completions:"Passing",player_pass_attempts:"Passing",player_pass_interceptions:"Passing",
  player_rush_yds:"Rushing",player_rush_attempts:"Rushing",player_reception_yds:"Receiving",player_receptions:"Receiving",
  player_rush_reception_yds:"Receiving",player_rush_tds:"Touchdowns",player_reception_tds:"Touchdowns",player_anytime_td:"Touchdowns",player_fantasy_points:"Top Props"
};
const providerLabel=book=>book?.title||book?.key||"Sportsbook";
const implied=price=>{const p=Number(price);if(!Number.isFinite(p)||p===0)return null;return p<0?(-p)/((-p)+100):100/(p+100)};
const round=(n,d=1)=>Number(Number(n).toFixed(d));
const clean=s=>String(s||"").trim();

function fairPairProbability(overPrice,underPrice){
  const o=implied(overPrice),u=implied(underPrice);if(o==null||u==null||o+u===0)return null;
  return {Over:o/(o+u),Under:u/(o+u)};
}
function confidence(prob){
  if(prob>=0.60)return "High";
  if(prob>=0.55)return "Medium";
  return "Low";
}
function summarizeEvent(event){return `${event.away_team} @ ${event.home_team}`}

async function fetchJson(url){
  const response=await fetch(url);
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`${response.status}: ${body?.message||body?.error||"request failed"}`);
  return body;
}
async function fetchEvents(sport){
  const q=new URLSearchParams({apiKey,dateFormat:"iso"});
  const events=await fetchJson(`https://api.the-odds-api.com/v4/sports/${sport}/events?${q}`);
  const horizon=now.getTime()+8*86400000;
  return (Array.isArray(events)?events:[]).filter(e=>{
    const t=new Date(e.commence_time).getTime();return Number.isFinite(t)&&t>=now.getTime()-2*3600000&&t<=horizon;
  }).sort((a,b)=>new Date(a.commence_time)-new Date(b.commence_time));
}
async function fetchEventProps(sport,event){
  const q=new URLSearchParams({apiKey,regions:"us,us2,us_dfs",markets:PROP_MARKETS.join(","),oddsFormat:"american",dateFormat:"iso",includeMultipliers:"true"});
  try{return await fetchJson(`https://api.the-odds-api.com/v4/sports/${sport}/events/${event.id}/odds?${q}`)}
  catch(error){console.error(`${sport} ${event.away_team} @ ${event.home_team}: ${error.message}`);return null}
}
function normalizeEvent(event,data){
  if(!data?.bookmakers?.length)return [];
  const rows=[];
  for(const book of data.bookmakers){
    for(const market of book.markets||[]){
      const byKey=new Map();
      for(const outcome of market.outcomes||[]){
        const player=clean(outcome.description||outcome.player||outcome.name);
        const side=outcome.name==="Over"||outcome.name==="Under"?outcome.name:null;
        const line=Number(outcome.point);
        if(!player||!side||!Number.isFinite(line))continue;
        const key=`${player}|${line}`;
        if(!byKey.has(key))byKey.set(key,{player,line});
        byKey.get(key)[side]={price:outcome.price,multiplier:outcome.multiplier??null};
      }
      for(const pair of byKey.values()){
        if(!pair.Over&&!pair.Under)continue;
        const fair=pair.Over&&pair.Under?fairPairProbability(pair.Over.price,pair.Under.price):null;
        let pick="Over",prob=.5;
        if(fair){pick=fair.Over>=fair.Under?"Over":"Under";prob=Math.max(fair.Over,fair.Under)}
        else if(pair.Over){pick="Over";prob=implied(pair.Over.price)||.5}
        else {pick="Under";prob=implied(pair.Under.price)||.5}
        const chosen=pair[pick];
        rows.push({
          id:`${event.id}:${market.key}:${pair.player}:${book.key}:${pair.line}`,
          eventId:event.id,commenceTime:event.commence_time,matchup:summarizeEvent(event),home:event.home_team,away:event.away_team,
          player:pair.player,market:market.key,marketLabel:MARKET_LABELS[market.key]||market.key.replace(/^player_/,"").replaceAll("_"," "),category:CATEGORY[market.key]||"Top Props",
          providerKey:book.key,provider:providerLabel(book),line:pair.line,pick,price:chosen?.price??null,multiplier:chosen?.multiplier??null,
          hitProbability:round(prob*100),confidence:confidence(prob),capturedAt:now.toISOString(),headshot:null
        });
      }
    }
  }
  return rows;
}
function dedupeAndRank(rows){
  const seen=new Set(),out=[];
  rows.sort((a,b)=>b.hitProbability-a.hitProbability||new Date(a.commenceTime)-new Date(b.commenceTime));
  for(const row of rows){
    const key=`${row.eventId}|${row.player}|${row.market}|${row.providerKey}|${row.line}`;
    if(seen.has(key))continue;seen.add(key);out.push(row);
  }
  return out;
}

function findEspnHeadshot(value){
  const queue=[value],seen=new Set();
  while(queue.length){
    const item=queue.shift();
    if(item==null)continue;
    if(typeof item==="string"){
      if(/^https?:\/\//i.test(item)&&/espncdn\.com/i.test(item)&&/(headshot|athletes)/i.test(item))return item;
      continue;
    }
    if(typeof item!=="object"||seen.has(item))continue;
    seen.add(item);
    for(const v of Object.values(item))queue.push(v);
  }
  return null;
}
async function espnHeadshot(player,league){
  try{
    const q=new URLSearchParams({query:player,limit:"8"});
    const data=await fetchJson(`https://site.web.api.espn.com/apis/common/v3/search?${q}`);
    const sportWord=league==="NFL"?"nfl":"college";
    const candidates=[];
    const walk=value=>{
      if(!value)return;
      if(Array.isArray(value)){for(const item of value)walk(item);return}
      if(typeof value!=="object")return;
      const text=JSON.stringify(value).toLowerCase();
      if(text.includes(player.split(" ").pop().toLowerCase())&&(text.includes(sportWord)||text.includes("football")))candidates.push(value);
      for(const v of Object.values(value))if(typeof v==="object")walk(v);
    };
    walk(data);
    for(const candidate of candidates){const url=findEspnHeadshot(candidate);if(url)return url}
    return findEspnHeadshot(data);
  }catch{return null}
}
async function enrichHeadshots(rows,league){
  const names=[...new Set(rows.slice(0,180).map(r=>r.player))];
  const result=new Map();
  let cursor=0;
  async function worker(){
    while(cursor<names.length){
      const name=names[cursor++];
      result.set(name,await espnHeadshot(name,league));
    }
  }
  await Promise.all(Array.from({length:Math.min(8,names.length)},()=>worker()));
  for(const row of rows)row.headshot=result.get(row.player)||null;
}

async function build(sport,label,maxEvents){
  if(!apiKey)return {updatedAt:now.toISOString(),league:label,source:"The Odds API",props:[],notice:"ODDS_API_KEY is not configured"};
  const events=(await fetchEvents(sport)).slice(0,maxEvents);
  const props=[];
  for(const event of events){
    const data=await fetchEventProps(sport,event);if(data)props.push(...normalizeEvent(event,data));
  }
  const ranked=dedupeAndRank(props);
  await enrichHeadshots(ranked,label);
  return {updatedAt:now.toISOString(),league:label,source:"The Odds API multi-book + DFS + ESPN player photos",eventsChecked:events.length,providers:[...new Set(ranked.map(p=>p.provider))].sort(),props:ranked};
}

await mkdir("data",{recursive:true});
const [nfl,cfb]=await Promise.all([
  build("americanfootball_nfl","NFL",16),
  build("americanfootball_ncaaf","College Football",32)
]);
await writeFile("data/props-nfl.json",JSON.stringify(nfl,null,2));
await writeFile("data/props-cfb.json",JSON.stringify(cfb,null,2));
console.log(`Player props: NFL ${nfl.props.length}, CFB ${cfb.props.length}`);
