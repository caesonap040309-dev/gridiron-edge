const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const erf=x=>{const sign=x<0?-1:1,a=Math.abs(x),t=1/(1+.3275911*a);return sign*(1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t)*Math.exp(-a*a));};
const cdf=z=>.5*(1+erf(z/Math.SQRT2));
const discrete=/tds|interceptions|attempts|completions|^player_receptions$|field_goals|kicking_points/;
function countCdf(k,mu,variance){
  if(k<0)return 0;if(mu<=0)return 1;
  // Gamma-Poisson prediction permits overdispersion; variance includes mean uncertainty.
  const v=Math.max(mu*1.1,variance),shape=mu*mu/(v-mu),p=shape/(shape+mu);
  let mass=Math.pow(p,shape),sum=mass;
  for(let i=0;i<Math.min(k,1000);i++){mass*=((i+shape)/(i+1))*(1-p);sum+=mass;}
  return clamp(sum,0,1);
}
export function propProbability({market,pick,line,values,projection,floor=1}){
  const n=values.length,weights=values.map((_,i)=>Math.pow(.82,i)),sum=weights.reduce((a,b)=>a+b,0),effective=sum*sum/weights.reduce((a,b)=>a+b*b,0),average=values.reduce((s,v,i)=>s+v*weights[i],0)/sum,variance=values.reduce((s,v,i)=>s+weights[i]*(v-average)**2,0)/sum;
  if(market==='player_anytime_td'){
    const yes=(values.filter(v=>v>0).length+1)/(n+2);return {probability:pick==='No'?1-yes:yes,effectiveSample:effective,pushProbability:0,distribution:'beta-binomial occurrence'};
  }
  const under=pick==='Under';let modeled,push=0;
  if(discrete.test(market)){
    const variancePredictive=Math.max(variance,floor*floor,projection)*(1+1/effective),below=countCdf(Math.ceil(line)-1,projection,variancePredictive),through=countCdf(Math.floor(line),projection,variancePredictive);
    push=Number.isInteger(line)?through-below:0;modeled=under?below:1-through;
  }else{
    const sd=Math.max(Math.sqrt(variance),floor)*Math.sqrt(1+1/effective),over=1-cdf((line-projection)/sd);modeled=under?1-over:over;
  }
  // Small samples cannot justify extreme probabilities solely from a narrow sample SD.
  const wins=values.filter(v=>under?v<line:v>line).length,empirical=(wins+2)/(n+4),probability=.65*modeled+.35*empirical;
  return {probability:clamp(probability,.08,.92),effectiveSample:effective,pushProbability:push,distribution:discrete.test(market)?'overdispersed count with sample uncertainty':'yardage distribution with sample uncertainty'};
}
