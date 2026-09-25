import { mkdir, readFile, writeFile } from "node:fs/promises";

async function read(path){try{return JSON.parse(await readFile(path,"utf8"))}catch{return {games:[]}}}
const round=value=>Math.round(value*10000)/10000;
function summarize(rows){
  const decided=rows.filter(row=>row.result!=="push");
  const wins=decided.filter(row=>row.result==="win").length,losses=decided.length-wins;
  const brier=decided.length?decided.reduce((sum,row)=>sum+(row.prob-row.outcome)**2,0)/decided.length:null;
  return {plays:rows.length,wins,losses,pushes:rows.length-decided.length,winRate:decided.length?round(wins/decided.length):null,brierScore:brier==null?null:round(brier)};
}
function auditLeague(data,league){
  const rows=[];
  for(const game of data?.games||[]){
    const p=game.prediction||{},homeScore=Number(game.homeScore),awayScore=Number(game.awayScore),created=new Date(p.createdAt),kickoff=new Date(game.date);
    if(!/final/i.test(game.status||"")||!Number.isFinite(homeScore)||!Number.isFinite(awayScore)||!Number.isFinite(created.getTime())||created>=kickoff)continue;
    if(homeScore!==awayScore&&Number.isFinite(Number(p.homeWin))){const homePick=Number(p.homeWin)>=50,outcome=homeScore>awayScore;rows.push({league,market:"moneyline",confidence:p.confidenceByMarket?.moneyline||p.confidence||"Unknown",prob:(homePick?Number(p.homeWin):100-Number(p.homeWin))/100,outcome:homePick===outcome?1:0,result:homePick===outcome?"win":"loss"})}
    const point=Number(p.market?.homePoint),homeCover=Number(p.homeCover),coverMargin=homeScore-awayScore+point;
    if(Number.isFinite(point)&&Number.isFinite(homeCover)){const homePick=homeCover>=50;rows.push({league,market:"spread",confidence:p.confidenceByMarket?.spread||p.confidence||"Unknown",prob:(homePick?homeCover:100-homeCover)/100,outcome:coverMargin===0?.5:(homePick===(coverMargin>0)?1:0),result:coverMargin===0?"push":(homePick===(coverMargin>0)?"win":"loss")})}
    const line=Number(p.market?.total),overProb=Number(p.overProb),difference=homeScore+awayScore-line;
    if(Number.isFinite(line)&&Number.isFinite(overProb)){const overPick=overProb>=50;rows.push({league,market:"total",confidence:p.confidenceByMarket?.total||p.confidence||"Unknown",prob:(overPick?overProb:100-overProb)/100,outcome:difference===0?.5:(overPick===(difference>0)?1:0),result:difference===0?"push":(overPick===(difference>0)?"win":"loss")})}
  }
  const byMarket=Object.fromEntries(["moneyline","spread","total"].map(market=>[market,summarize(rows.filter(row=>row.market===market))]));
  const byConfidence=Object.fromEntries(["High","Medium","Low"].map(level=>[level,summarize(rows.filter(row=>row.confidence===level))]));
  return {overall:summarize(rows),byMarket,byConfidence};
}

const [cfb,nfl]=await Promise.all([read("data/live.json"),read("data/nfl.json")]);
const output={updatedAt:new Date().toISOString(),method:"pregame snapshots only; pushes excluded from win rate",cfb:auditLeague(cfb,"cfb"),nfl:auditLeague(nfl,"nfl")};
await mkdir("data",{recursive:true});
await writeFile("data/model-audit.json",JSON.stringify(output,null,2)+"\n");
console.log(`Audit saved: CFB ${output.cfb.overall.plays} graded markets; NFL ${output.nfl.overall.plays}`);
