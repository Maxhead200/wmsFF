export type Usage = Record<string, {count:number; last:number}>;
export const usageKey=(userId:string)=>`wms.soul.quick.v1:${encodeURIComponent(userId)}`;
const validId=(id:string)=>/^[a-z][a-z0-9-]{0,79}$/.test(id)&&!['overview','constructor','prototype'].includes(id);
// FIX: local optional history is untrusted and must never break navigation.
export function parseUsage(raw:string|null):Usage {
 try {
  const value=JSON.parse(raw||'{}');if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const result:Usage={};
  for(const [id,entry] of Object.entries(value).slice(0,200)){
   if(!validId(id)||!entry||typeof entry!=='object')continue;
   const v=entry as Usage[string];
   if(Number.isSafeInteger(v.count)&&v.count>0&&Number.isFinite(v.last)&&v.last>=0)result[id]={count:v.count,last:v.last};
  }
  return result;
 }catch{return {};}
}
export function recordUsage(usage:Usage,id:string,now:number):Usage {
 if(!validId(id))return usage;
 return {...usage,[id]:{count:Math.min((usage[id]?.count||0)+1,Number.MAX_SAFE_INTEGER),last:now}};
}
export function popularItems<T extends {id:string}>(items:T[],usage:Usage):T[] {
 return items.filter(i=>validId(i.id)&&usage[i.id]?.count>0).sort((a,b)=>usage[b.id].count-usage[a.id].count||usage[b.id].last-usage[a.id].last).slice(0,8);
}
