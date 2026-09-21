import { mkdir, readFile, writeFile } from "node:fs/promises";

const now=new Date();
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
async function read(path){try{return JSON.parse(await readFile(path,"utf8"))}catch{return {games:[]}}}

function fit(samples){
  const brier=factor=>samples.reduce((sum,row)=>{const adjusted=clamp(.5+(row.prob-.5)*factor,.02,.98);return sum+(adjusted-row.outcome)**2},0)/Math.max(1,samples.length);
  let bestFactor=1,bestBrier=brier(1);
  if(samples.length>=25)for(let factor=.55;factor<=1.1001;factor+=.025){const score=brier(factor);if(score<bestBrier){bestBrier=score;bestFactor=factor}}
  const evidence=samples.length/(samples.length+60),blended=samples.length>=25?1+(bestFactor-1)*evidence:1;
  return {factor:Number(clamp(blended,.68,1.04).toFixed(3)),sampleSize:samples.length,brierScore:Number(brier(1).toFixed(4)),calibratedBrierScore:Number(bestBrier.toFixed(4)),status:samples.length>=25?"active":"collecting-data"};
}

function calibrationFor(data){
  const win=[],spread=[],total=[];
  for(const game of data?.games||[]){
    const p=game.prediction||{},kickoff=new Date(game.date),created=new Date(p.createdAt),homeScore=Number(game.homeScore),awayScore=Number(game.awayScore);
    if(!/final/i.test(game.status||"")||!Number.isFinite(homeScore)||!Number.isFinite(awayScore)||!Number.isFinite(kickoff.getTime())||!Number.isFinite(created.getTime())||created>=kickoff)continue;
    if(homeScore!==awayScore&&Number.isFinite(Number(p.homeWin)))win.push({prob:Number(p.homeWin)/100,outcome:homeScore>awayScore?1:0});
    const homePoint=Number(p.market?.homePoint),homeCover=Number(p.homeCover),coverMargin=homeScore-awayScore+homePoint;
    if(Number.isFinite(homePoint)&&Number.isFinite(homeCover)&&coverMargin!==0)spread.push({prob:homeCover/100,outcome:coverMargin>0?1:0});
    const marketTotal=Number(p.market?.total),overProb=Number(p.overProb),actualTotal=homeScore+awayScore;
    if(Number.isFinite(marketTotal)&&Number.isFinite(overProb)&&actualTotal!==marketTotal)total.push({prob:overProb/100,outcome:actualTotal>marketTotal?1:0});
  }
  const fitted={win:fit(win),spread:fit(spread),total:fit(total)};
  return {...fitted,probabilityFactor:fitted.win.factor,spreadProbabilityFactor:fitted.spread.factor,totalProbabilityFactor:fitted.total.factor,sampleSize:fitted.win.sampleSize,status:fitted.win.status};
}

const [cfb,nfl]=await Promise.all([read("data/live.json"),read("data/nfl.json")]);
const output={updatedAt:now.toISOString(),method:"out-of-sample Brier shrinkage by market",minimumSample:25,cfb:calibrationFor(cfb),nfl:calibrationFor(nfl)};
await mkdir("data",{recursive:true});
await writeFile("data/model-calibration.json",JSON.stringify(output,null,2)+"\n");
console.log(`Calibration: CFB W/S/T ${output.cfb.win.sampleSize}/${output.cfb.spread.sampleSize}/${output.cfb.total.sampleSize}; NFL ${output.nfl.win.sampleSize}/${output.nfl.spread.sampleSize}/${output.nfl.total.sampleSize}`);
