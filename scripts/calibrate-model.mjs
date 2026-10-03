import {mkdir,readFile,writeFile} from "node:fs/promises";
import {numeric} from "./model-context.mjs";
import {latestForecasts} from "./production-evaluation.mjs";
import {fitChronological} from "./calibration-fit.mjs";
const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,"utf8"))}catch{return fallback}};
const [cfb,nfl,archive,recovered]=await Promise.all([read("data/live.json",{games:[]}),read("data/nfl.json",{games:[]}),read("data/model-snapshots.json",{entries:[]}),read("data/verified-historical-snapshots.json",{entries:[]})]);
function calibrate(data,league){
 const samples={win:[],spread:[],total:[]};
 for(const {game:g,prediction:p} of latestForecasts(data.games||[],[...(archive.entries||[]),...(recovered.entries||[])],league)){
  if(!(g.statusCompleted||/final/i.test(g.status||"")))continue;
  const home=numeric(g.homeScore),away=numeric(g.awayScore);if(home==null||away==null)continue;
  const date=new Date(g.date).getTime(),raw=p.probabilityEvidence;
  if(home!==away&&numeric(p.homeWin)!=null)samples.win.push({date,prob:raw?.homeWin??p.homeWin/100,outcome:home>away?1:0});
  const quote=p.market,time=new Date(quote?.capturedAt);if(!Number.isFinite(time.getTime())||time>=new Date(g.date))continue;
  const point=numeric(quote?.homePoint),line=numeric(quote?.total),margin=home-away;
  if(point!=null&&numeric(p.homeCover)!=null&&numeric(p.marketMargin)!=null&&Math.abs(point+p.marketMargin)<.01&&margin+point!==0)samples.spread.push({date,prob:raw?.homeCover??p.homeCover/100,outcome:margin+point>0?1:0});
  if(line!=null&&numeric(p.overProb)!=null&&numeric(p.marketTotal)!=null&&Math.abs(line-p.marketTotal)<.01&&home+away!==line)samples.total.push({date,prob:raw?.over??p.overProb/100,outcome:home+away>line?1:0});
 }
 const fit=Object.fromEntries(Object.entries(samples).map(([market,rows])=>[market,fitChronological(rows)]));
 return {...fit,probabilityFactor:fit.win.factor,spreadProbabilityFactor:fit.spread.factor,totalProbabilityFactor:fit.total.factor,sampleSize:fit.win.sampleSize,status:fit.win.status};
}
const output={updatedAt:new Date().toISOString(),method:"Chronological training and later held-out evaluation by market; aligned pregame prices only. Factors remain neutral without sufficient later evidence.",minimumSample:60,cfb:calibrate(cfb,"cfb"),nfl:calibrate(nfl,"nfl")};
await mkdir("data",{recursive:true});await writeFile("data/model-calibration.json",JSON.stringify(output,null,2)+"\n");console.log(`Held-out calibration saved: CFB ${output.cfb.status}; NFL ${output.nfl.status}`);
