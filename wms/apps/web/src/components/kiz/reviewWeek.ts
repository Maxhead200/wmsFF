// FIX: API pages are ordered by first appeal, newest first; old history stays stored.
export function reviewWeek<T extends {createdAt:string}>(page:{items:T[];nextCursor:string|null},now=Date.now()) {
  const cutoff=now-7*24*60*60*1000;
  const items=page.items.filter(row=>Number.isFinite(Date.parse(row.createdAt))&&Date.parse(row.createdAt)>=cutoff);
  return {items,nextCursor:page.items.some(row=>Date.parse(row.createdAt)<cutoff)?null:page.nextCursor};
}
