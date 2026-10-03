const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const brier=(rows,factor)=>mean(rows.map(r=>(clamp(.5+(r.prob-.5)*factor,.02,.98)-r.outcome)**2));
export function fitChronological(samples){
  const rows=samples.filter(r=>r.prob>0&&r.prob<1&&[0,1].includes(r.outcome)).sort((a,b)=>a.date-b.date),n=rows.length;
  const base={factor:1,sampleSize:n,effectiveSample:n,brierScore:brier(rows,1),calibratedBrierScore:null,status:'insufficient-held-out-evidence',trainingSamples:0,holdoutSamples:0};
  if(n<60)return base;
  const split=Math.min(n-20,Math.floor(n*.7)),training=rows.slice(0,split),holdout=rows.slice(split);
  // Do not split simultaneous games between training and holdout.
  const boundary=holdout[0].date,train=training.filter(r=>r.date<boundary),validation=[...training.filter(r=>r.date>=boundary),...holdout];
  if(train.length<30||validation.length<20)return base;
  let best=1,score=brier(train,1);
  for(let f=.55;f<=1.10001;f+=.025){const candidate=brier(train,f);if(candidate<score){best=f;score=candidate;}}
  const factor=clamp(1+(best-1)*train.length/(train.length+80),.68,1.04),before=brier(validation,1),after=brier(validation,factor);
  const deltas=validation.map(r=>(clamp(.5+(r.prob-.5)*factor,.02,.98)-r.outcome)**2-(r.prob-r.outcome)**2),delta=mean(deltas),se=Math.sqrt(mean(deltas.map(d=>(d-delta)**2))/validation.length),interval=[delta-1.96*se,delta+1.96*se];
  const promote=before-after>=.0005&&(factor<=1||interval[1]<0);
  return {...base,factor:promote?Number(factor.toFixed(3)):1,status:promote?'held-out-improvement':'held-out-no-improvement',trainingSamples:train.length,holdoutSamples:validation.length,holdoutBrier:before,holdoutCandidateBrier:after,holdoutDifference95Interval:interval,calibratedBrierScore:promote?after:before};
}

export function fitResidualCorrection(samples,cap=2){
  const rows=samples.filter(r=>Number.isFinite(r.residual)&&Number.isFinite(r.date)).sort((a,b)=>a.date-b.date);
  if(rows.length<60)return {correction:0,samples:rows.length,status:'insufficient-held-out-evidence'};
  const boundary=rows[Math.floor(rows.length*.7)].date,train=rows.filter(r=>r.date<boundary),holdout=rows.filter(r=>r.date>=boundary);
  if(train.length<30||holdout.length<20)return {correction:0,samples:rows.length,status:'insufficient-held-out-evidence'};
  const candidate=clamp(mean(train.map(r=>clamp(r.residual,-14,14)))*.4,-cap,cap),deltas=holdout.map(r=>Math.abs(r.residual-candidate)-Math.abs(r.residual)),delta=mean(deltas),se=Math.sqrt(mean(deltas.map(d=>(d-delta)**2))/deltas.length),improved=delta<=-.2&&delta+1.96*se<0;
  return {correction:improved?candidate:0,samples:rows.length,status:improved?'held-out-improvement':'held-out-no-improvement',holdoutSamples:holdout.length,meanErrorDifference:delta};
}
