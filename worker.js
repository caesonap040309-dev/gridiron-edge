const ESPN="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const ODDS="https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds";
const headers={"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS","cache-control":"public,max-age=30"};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
export default {async fetch(request,env){
  if(request.method==="OPTIONS")return new Response(null,{headers});
  const url=new URL(request.url);
  try{
    if(url.pathname==="/api/games"){
      const year=url.searchParams.get("year")||new Date().getUTCFullYear(); const week=url.searchParams.get("week")||"0";
      const q=new URLSearchParams({limit:"100",groups:"80",dates:String(year),seasontype:"2"}); if(week!=="0")q.set("week",week);
      const r=await fetch(`${ESPN}?${q}`);if(!r.ok)throw new Error("ESPN schedule unavailable");const data=await r.json();
      const games=(data.events||[]).map(e=>{const c=e.competitions?.[0]||{},teams=c.competitors||[],home=teams.find(t=>t.homeAway==="home"),away=teams.find(t=>t.homeAway==="away");return{id:e.id,date:e.date,status:e.status?.type?.shortDetail,home:home?.team?.displayName||"TBD",away:away?.team?.displayName||"TBD",homeScore:home?.score,awayScore:away?.score};});
      return json({games});
    }
    if(url.pathname==="/api/odds"){
      if(!env.ODDS_API_KEY)return json({error:"ODDS_API_KEY is not configured"},503);
      const q=new URLSearchParams({apiKey:env.ODDS_API_KEY,regions:"us",markets:"h2h,spreads,totals",oddsFormat:"american",dateFormat:"iso"});
      const r=await fetch(`${ODDS}?${q}`);if(!r.ok)return json({error:"Odds provider error",status:r.status},502);return json({events:await r.json()});
    }
    return json({name:"Gridiron Edge API",status:"ok"});
  }catch(error){return json({error:error.message||"Unexpected error"},500)}
}};
