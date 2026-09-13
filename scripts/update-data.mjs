import { mkdir, writeFile } from "node:fs/promises";

const now=new Date();
const season=Number(process.env.SEASON||now.getUTCFullYear());
const espn="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const games=[];
const events=[];
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
    games.push({id:event.id,season,week,date:event.date,status:event.status?.type?.shortDetail,home:homeName,away:awayName,homeScore:home?.score,awayScore:away?.score});
    const line=competition.odds?.[0];
    if(line){
      const favorite=(line.details||"").replace(/\s[-+]?[\d.]+$/,"");
      const spreadPoint=Number(line.spread);
      const homeFav=favorite&&homeName.toLowerCase().includes(favorite.toLowerCase());
      const awayFav=favorite&&awayName.toLowerCase().includes(favorite.toLowerCase());
      const homePoint=homeFav?-Math.abs(spreadPoint):awayFav?Math.abs(spreadPoint):null;
      const spreadOutcomes=homePoint==null?[]:[{name:homeName,point:homePoint,price:line.homeTeamOdds?.spreadOdds},{name:awayName,point:-homePoint,price:line.awayTeamOdds?.spreadOdds}];
      const total=Number(line.overUnder);
      const totalOutcomes=Number.isFinite(total)?[{name:"Over",point:total,price:line.overOdds},{name:"Under",point:total,price:line.underOdds}]:[];
      const moneyline=[{name:homeName,price:line.homeTeamOdds?.moneyLine},{name:awayName,price:line.awayTeamOdds?.moneyLine}].filter(o=>o.price!=null);
      const markets=[];
      if(spreadOutcomes.length)markets.push({key:"spreads",outcomes:spreadOutcomes});
      if(totalOutcomes.length)markets.push({key:"totals",outcomes:totalOutcomes});
      if(moneyline.length)markets.push({key:"h2h",outcomes:moneyline});
      events.push({id:event.id,commence_time:event.date,home_team:homeName,away_team:awayName,bookmakers:[{key:"espn",title:line.provider?.name||"ESPN market",markets}]});
    }
  }
}
const publishers=[
  ["ESPN","espn.com"],
  ["Bleacher Report","bleacherreport.com"],
  ["Yahoo Sports","sports.yahoo.com"],
  ["Sporting News","sportingnews.com"],
  ["The Athletic","nytimes.com/athletic"]
];
const decode=value=>value.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
const tag=(xml,name)=>decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,"i"))?.[1]||"");
const news=[];
for(const [source,domain] of publishers){
  const query=encodeURIComponent(`college football site:${domain}`);
  try{
    const response=await fetch(`https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`);
    if(!response.ok)continue;
    const xml=await response.text();
    for(const item of xml.match(/<item>[\s\S]*?<\/item>/gi)?.slice(0,25)||[]){
      const rawTitle=tag(item,"title");
      const title=rawTitle.replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")}$`,"i"),"");
      const description=tag(item,"description");
      news.push({source,title,summary:description.slice(0,220),link:tag(item,"link"),publishedAt:tag(item,"pubDate")});
    }
  }catch(error){console.warn(`News feed unavailable for ${source}: ${error.message}`)}
}
await mkdir("data",{recursive:true});
await writeFile("data/live.json",JSON.stringify({updatedAt:new Date().toISOString(),games,events,news},null,2)+"\n");
console.log(`Saved ${games.length} games, ${events.length} markets, and ${news.length} news items`);
