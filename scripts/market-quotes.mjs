export function consensusPoint(values){
  const usable=values.filter(Number.isFinite);if(!usable.length)return null;
  const counts=new Map();for(const value of usable)counts.set(value,(counts.get(value)||0)+1);
  const sorted=[...usable].sort((a,b)=>a-b),middle=sorted[Math.floor(sorted.length/2)];
  return [...counts].sort((a,b)=>b[1]-a[1]||Math.abs(a[0]-middle)-Math.abs(b[0]-middle)||a[0]-b[0])[0][0];
}
