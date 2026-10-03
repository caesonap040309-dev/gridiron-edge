import {mkdir,readFile,writeFile} from "node:fs/promises";
import {gameEvaluation,qualifiedEvaluation,propEvaluation,filterReview} from "./production-evaluation.mjs";
const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,"utf8"))}catch{return fallback}};
const [cfb,nfl,archive,cfbProps,nflProps,recovered]=await Promise.all([read("data/live.json",{games:[]}),read("data/nfl.json",{games:[]}),read("data/model-snapshots.json",{entries:[]}),read("data/props-cfb.json",{}),read("data/props-nfl.json",{}),read("data/verified-historical-snapshots.json",{entries:[]})]);
const now=new Date(),output={schemaVersion:2,recoveredForecasts:recovered.entries.length,updatedAt:now.toISOString(),method:"Latest valid saved pregame forecast per game; side-specific recorded prices; matched sportsbook comparisons. All forecasts and qualified bets reported separately."};
for(const [league,data,props] of [["cfb",cfb,cfbProps],["nfl",nfl,nflProps]])output[league]={...gameEvaluation(data.games||[],[...(archive.entries||[]),...(recovered.entries||[])],league),qualified:qualifiedEvaluation(archive.entries||[],data.games||[],league),props:propEvaluation(props),filters:filterReview(data.games||[],data.events||[],props,now.getTime())};
await mkdir("data",{recursive:true});await writeFile("data/model-audit.json",JSON.stringify(output,null,2)+"\n");
console.log(`Production audit: CFB ${output.cfb.overall.plays}, NFL ${output.nfl.overall.plays} graded markets; qualified betting records separated.`);
