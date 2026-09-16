import { mkdir, readFile, writeFile } from "node:fs/promises";

const now=new Date();
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
async function read(path){try{return JSON.parse(await readFile(path,"utf8"))}catch{return {games:[]}}}

function calibrationFor(data){
  const samples=[];
  for(const game of data?.games||[]){
    const p=game.prediction||{},kickoff=new Date(game.date),created=new Date(p.createdAt);
    if(!/final/i.test(game.status||"")||!p.winner||!Number.isFinite(Number(p.homeWin))||!Number.isFinite(Number(game.homeScore))||!Number.isFinite(Number(game.awayScore)))continue;
    if(!Number.isFinite(kickoff.getTime())||!Number.isFinite(created.getTime())||created>=kickoff||Number(game.homeScore)===Number(game.awayScore))continue;
    samples.push({prob:Number(p.homeWin)/100,outcome:Number(game.homeScore)>Number(game.awayScore)?1:0});
  }
  const brier=factor=>samples.reduce((sum,row)=>{const adjusted=clamp(.5+(row.prob-.5)*factor,.02,.98);return sum+(adjusted-row.outcome)**2},0)/Math.max(1,samples.length);
  let bestFactor=1,bestBrier=brier(1);
  if(samples.length>=20){for(let factor=.65;factor<=1.1501;factor+=.025){const score=brier(factor);if(score<bestBrier){bestBrier=score;bestFactor=factor}}}
  const evidence=samples.length/(samples.length+40),blended=samples.length>=20?1+(bestFactor-1)*evidence:1;
  return {probabilityFactor:Number(clamp(blended,.8,1.08).toFixed(3)),sampleSize:samples.length,brierScore:Number(brier(1).toFixed(4)),calibratedBrierScore:Number(bestBrier.toFixed(4)),status:samples.length>=20?"active":"collecting-data"};
}

const [cfb,nfl]=await Promise.all([read("data/live.json"),read("data/nfl.json")]);
const output={updatedAt:now.toISOString(),method:"rolling Brier-score probability calibration",minimumSample:20,cfb:calibrationFor(cfb),nfl:calibrationFor(nfl)};
await mkdir("data",{recursive:true});
await writeFile("data/model-calibration.json",JSON.stringify(output,null,2)+"\n");
console.log(`Calibration: CFB ${output.cfb.status} (${output.cfb.sampleSize}), NFL ${output.nfl.status} (${output.nfl.sampleSize})`);
