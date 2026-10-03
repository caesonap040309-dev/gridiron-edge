const aliases={ncstatewolfpack:"northcarolinastatewolfpack",massachusettsminutemen:"umassminutemen",ulmonroewarhawks:"louisianamonroewarhawks",miamihurricanes:"miamiflhurricanes"};
const clean=value=>{const key=String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");return aliases[key]||key;};
const text=value=>String(value||"").replace(/<[^>]*>/g," ").replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
export function parseCoversInjuries(html,now=new Date()){
  const teams=new Map();
  for(const section of html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)){
    const block=section[1],name=text(block.match(/covers-CoversMatchups-teamName[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    if(!name)continue;
    const body=block.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
    if(!body)continue;
    const rows=[...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)],injuries=[];
    let valid=/No injuries to report/i.test(body);
    for(let i=0;i<rows.length;i++){
      const cells=[...rows[i][1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
      if(cells.length<3)continue;
      const status=text(cells[2].match(/<b>([\s\S]*?)<\/b>/i)?.[1]);
      if(!/^(Out|Questionable|Doubtful|Probable|Suspended|Active)/i.test(status))continue;
      const dateText=text(cells[2]).match(/\(([^)]+)\)/)?.[1],date=dateText?new Date(`${dateText} ${now.getUTCFullYear()} 12:00 UTC`):null;
      if(date&&date>new Date(now.getTime()+86400000))date.setUTCFullYear(date.getUTCFullYear()-1);
      injuries.push({name:text(cells[0]),position:text(cells[1]),status,detail:text(rows[i+1]?.[1].match(/covers-CoversMatchups-injuryCopy[^>]*>([\s\S]*?)<\/div>/i)?.[1])||null,reportedAt:date&&!isNaN(date)?date.toISOString():null});
      valid=true;
    }
    if(valid)teams.set(clean(name),{name,injuries});
  }
  return teams;
}
export async function loadInjuryFallback(league,now=new Date()){
  const url=`https://www.covers.com/sport/football/${league==="nfl"?"nfl":"ncaaf"}/injuries`;
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const teams=parseCoversInjuries(await response.text(),now);
    if(teams.size<20)throw new Error(`Incomplete injury page: ${teams.size} teams`);
    console.log(`Loaded ${teams.size} ${league} injury reports from Covers`);
    return {teams,checkedAt:now.toISOString(),url};
  }catch(error){console.error(`Injury fallback unavailable: ${error.message}`);return {teams:new Map(),checkedAt:now.toISOString(),url};}
}
export function fallbackSummary(feed,game,games){
  const groups=[];
  for(const side of ["home","away"]){
    const team=feed.teams.get(clean(game[side]));if(!team)return null;
    const known=new Map();
    for(const old of games)for(const oldSide of ["home","away"])if(old[oldSide]===game[side])for(const player of old.performance?.[oldSide]?.players||[])known.set(player.name,player.id);
    const injuries=team.injuries.map(item=>{
      const abbreviated=item.name.match(/^([A-Z])\.\s*(.+)$/i);
      const matches=abbreviated?[...known].filter(([name])=>name[0].toLowerCase()===abbreviated[1].toLowerCase()&&clean(name.split(/\s+/).slice(1).join(" "))===clean(abbreviated[2])):[];
      const match=matches.length===1?matches[0]:null;
      return {...item,athlete:{id:match?.[1]||null,displayName:match?.[0]||item.name,position:{abbreviation:item.position}},details:{detail:item.detail}};
    });
    groups.push({team:{id:game[`${side}Id`],displayName:game[side]},injuries});
  }
  return {injuries:groups};
}
export function selectInjuryReport(summary,normalized,cached,checkedAt){
  // Missing section is unknown coverage; explicit empty reports can clear old rows.
  if(Array.isArray(summary?.injuries))return {...normalized,checkedAt,coverage:"reported"};
  return {...(cached||{home:[],away:[],updatedAt:null,source:"Unavailable"}),checkedAt,coverage:"unavailable",refreshError:"Provider returned no injury section"};
}
