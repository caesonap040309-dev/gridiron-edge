export function promotionGate(rows){
  const usable=rows.filter(r=>Number.isFinite(r.candidate)&&Number.isFinite(r.baseline)&&r.date),weeks=new Map();
  for(const row of usable){const key=Math.floor(new Date(row.date).getTime()/(7*86400000));if(!weeks.has(key))weeks.set(key,[]);weeks.get(key).push(row.candidate-row.baseline);}
  const deltas=[...weeks.values()].map(a=>a.reduce((s,n)=>s+n,0)/a.length),n=deltas.length,mean=n?deltas.reduce((s,d)=>s+d,0)/n:null,se=n>1?Math.sqrt(deltas.reduce((s,d)=>s+(d-mean)**2,0)/(n-1)/n):null,interval=se==null?null:[mean-1.96*se,mean+1.96*se];
  const enough=usable.length>=100&&n>=6,promote=enough&&interval[1]<0&&mean<=-.2;
  return {samples:usable.length,weeks:n,meanErrorDifference:mean,difference95Interval:interval,promote,status:!enough?'more completed forward evidence required':promote?'improvement supports promotion':'retain existing coefficients',minimumGames:100,minimumWeeks:6};
}
