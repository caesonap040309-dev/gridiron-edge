import { readFile, writeFile } from "node:fs/promises";

const now=new Date();
const clean=value=>String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const number=value=>{const match=String(value??"").replace(/,/g,"").match(/-?\d+(?:\.\d+)?/);return match?Number(match[0]):null};
const gameKey=(away,home)=>`${clean(away)}|${clean(home)}`;
async function read(path){try{return JSON.parse(await readFile(path,"utf8"))}catch{return null}}
async function fetchJson(url){const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json()}

function freezePregamePicks(data){
  const picks=Array.isArray(data?.picks)?data.picks:[];
  const saved=new Set(picks.map(p=>`${p.eventId}|${clean(p.player)}|${p.market}`));
  const best=new Map();
  for(const prop of data?.props||[]){
    const kickoff=new Date(prop.commenceTime).getTime(),captured=new Date(prop.capturedAt).getTime();
    if(!Number.isFinite(kickoff)||!Number.isFinite(captured)||captured>=kickoff||now.getTime()>=kickoff)continue;
    const key=`${prop.eventId}|${clean(prop.player)}|${prop.market}`;
    const old=best.get(key);
    if(!old||Number(prop.hitProbability)>Number(old.hitProbability))best.set(key,prop);
  }
  for(const [key,prop] of best){
    if(saved.has(key))continue;
    picks.push({id:`pick:${key}`,eventId:prop.eventId,commenceTime:prop.commenceTime,matchup:prop.matchup,home:prop.home,away:prop.away,player:prop.player,market:prop.market,marketLabel:prop.marketLabel,category:prop.category,provider:prop.provider,line:prop.line,pick:prop.pick,price:prop.price??null,hitProbability:prop.hitProbability,confidence:prop.confidence,capturedAt:prop.capturedAt,status:"pending",actual:null,gradedAt:null});
  }
  return picks;
}

function playerStats(summary){
  const players=new Map();
  const ensure=name=>{const key=clean(name);if(!players.has(key))players.set(key,{name,pass:{},rush:{},receive:{},kick:{}});return players.get(key)};
  for(const team of summary?.boxscore?.players||[]){
    for(const group of team.statistics||[]){
      const groupName=String(group.name||group.type||group.displayName||"").toLowerCase();
      const labels=group.labels||group.names||[];
      for(const entry of group.athletes||[]){
        const name=entry.athlete?.displayName||entry.athlete?.fullName||entry.displayName;
        if(!name)continue;
        const target=ensure(name),stats=entry.stats||entry.statistics||[];
        if(groupName.includes("pass")){
          labels.forEach((label,index)=>{const tag=String(label).toUpperCase(),raw=stats[index];if(tag.includes("C/ATT")){const [c,a]=String(raw).split("/").map(number);target.pass.completions=c;target.pass.attempts=a}else if(tag==="YDS")target.pass.yards=number(raw);else if(tag==="TD")target.pass.tds=number(raw);else if(tag==="INT")target.pass.interceptions=number(raw);else if(tag.includes("LONG"))target.pass.longest=number(raw)});
        }else if(groupName.includes("rush")){
          labels.forEach((label,index)=>{const tag=String(label).toUpperCase(),raw=stats[index];if(tag==="CAR"||tag==="ATT")target.rush.attempts=number(raw);else if(tag==="YDS")target.rush.yards=number(raw);else if(tag==="TD")target.rush.tds=number(raw);else if(tag.includes("LONG"))target.rush.longest=number(raw)});
        }else if(groupName.includes("receiv")){
          labels.forEach((label,index)=>{const tag=String(label).toUpperCase(),raw=stats[index];if(tag==="REC")target.receive.receptions=number(raw);else if(tag==="YDS")target.receive.yards=number(raw);else if(tag==="TD")target.receive.tds=number(raw);else if(tag.includes("LONG"))target.receive.longest=number(raw)});
        }else if(groupName.includes("kick")){
          labels.forEach((label,index)=>{const tag=String(label).toUpperCase(),raw=stats[index];if(tag==="FG"){const made=String(raw).split("/")[0];target.kick.fieldGoals=number(made)}else if(tag==="XP"){const made=String(raw).split("/")[0];target.kick.extraPoints=number(made)}else if(tag==="PTS")target.kick.points=number(raw)});
        }
      }
    }
  }
  return players;
}

function actualFor(market,stats){
  if(!stats)return null;
  const values={
    player_pass_yds:stats.pass.yards,player_pass_tds:stats.pass.tds,player_pass_completions:stats.pass.completions,
    player_pass_attempts:stats.pass.attempts,player_pass_interceptions:stats.pass.interceptions,player_pass_longest_completion:stats.pass.longest,
    player_rush_yds:stats.rush.yards,player_rush_attempts:stats.rush.attempts,player_rush_longest:stats.rush.longest,player_rush_tds:stats.rush.tds,
    player_reception_yds:stats.receive.yards,player_receptions:stats.receive.receptions,player_reception_longest:stats.receive.longest,player_reception_tds:stats.receive.tds,
    player_rush_reception_yds:Number.isFinite(stats.rush.yards)&&Number.isFinite(stats.receive.yards)?stats.rush.yards+stats.receive.yards:null,
    player_anytime_td:Number.isFinite(stats.rush.tds)||Number.isFinite(stats.receive.tds)?(stats.rush.tds||0)+(stats.receive.tds||0):null,
    player_field_goals:stats.kick.fieldGoals,
    player_kicking_points:Number.isFinite(stats.kick.points)?stats.kick.points:(Number.isFinite(stats.kick.fieldGoals)||Number.isFinite(stats.kick.extraPoints)?(stats.kick.fieldGoals||0)*3+(stats.kick.extraPoints||0):null)
  };
  return Number.isFinite(values[market])?values[market]:null;
}

function resultFor(pick,actual){
  const line=Number(pick.line);if(!Number.isFinite(line)||!Number.isFinite(actual))return null;
  if(pick.pick==="Yes")return actual>0?"win":"loss";
  if(pick.pick==="No")return actual===0?"win":"loss";
  if(actual===line)return "push";
  if(pick.pick==="Over")return actual>line?"win":"loss";
  if(pick.pick==="Under")return actual<line?"win":"loss";
  return null;
}

async function grade(data,schedule,league){
  data.picks=freezePregamePicks(data);
  const completed=new Map((schedule?.games||[]).filter(game=>game.statusCompleted||/final/i.test(game.status||"")).map(game=>[gameKey(game.away,game.home),game]));
  const summaries=new Map();
  for(const pick of data.picks.filter(p=>p.status==="pending")){
    const game=completed.get(gameKey(pick.away,pick.home));if(!game?.id)continue;
    if(!summaries.has(game.id)){
      const sport=league==="nfl"?"nfl":"college-football";
      try{summaries.set(game.id,playerStats(await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/summary?event=${game.id}`)))}catch(error){console.error(`Could not grade ${pick.matchup}: ${error.message}`);summaries.set(game.id,null)}
    }
    const stats=summaries.get(game.id),player=stats?.get(clean(pick.player)),actual=actualFor(pick.market,player);
    const status=resultFor(pick,actual);if(!status)continue;
    pick.actual=actual;pick.status=status;pick.gradedAt=now.toISOString();pick.gameId=String(game.id);
  }
  const graded=data.picks.filter(p=>["win","loss","push"].includes(p.status));
  data.record={wins:graded.filter(p=>p.status==="win").length,losses:graded.filter(p=>p.status==="loss").length,pushes:graded.filter(p=>p.status==="push").length,graded:graded.length,pending:data.picks.filter(p=>p.status==="pending").length,updatedAt:now.toISOString()};
  data.recordsByCategory={};
  for(const pick of graded){const key=pick.category||"Other",r=data.recordsByCategory[key]||={wins:0,losses:0,pushes:0,graded:0};r[pick.status==="win"?"wins":pick.status==="loss"?"losses":"pushes"]++;r.graded++}
  return data;
}

const [nfl,cfb,nflSchedule,cfbSchedule]=await Promise.all([read("data/props-nfl.json"),read("data/props-cfb.json"),read("data/nfl.json"),read("data/live.json")]);
if(nfl){await writeFile("data/props-nfl.json",JSON.stringify(await grade(nfl,nflSchedule,"nfl"),null,2))}
if(cfb){await writeFile("data/props-cfb.json",JSON.stringify(await grade(cfb,cfbSchedule,"cfb"),null,2))}
console.log(`Prop grading complete: NFL ${nfl?.record?.graded||0}, CFB ${cfb?.record?.graded||0}`);
