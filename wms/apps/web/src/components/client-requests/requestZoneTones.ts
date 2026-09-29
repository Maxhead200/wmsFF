import type { FbsOrderSummary } from '../../lib/api';
import { fbsDeadlineSnapshot, type FbsDeadlineTone } from '../fbs/fbsOrderDeadlineReport';
// FIX: count actual active orders; invalid dates and completed orders cannot invent urgency.
export function requestZoneTones(orders: FbsOrderSummary[], now: number): Record<string,FbsDeadlineTone> {
  const counts=new Map<string,Record<FbsDeadlineTone,number>>(),seen=new Set<string>();
  for(const order of orders){
    if(order.category!=='active'||!order.request)continue;
    const key=`${order.connectionId}:${order.id}`;
    if(seen.has(key))continue;seen.add(key);
    const snapshot=fbsDeadlineSnapshot(order,now);if(!snapshot)continue;
    const count=counts.get(order.request.id)??{normal:0,warning:0,critical:0};count[snapshot.tone]++;counts.set(order.request.id,count);
  }
  return Object.fromEntries([...counts].map(([id,count])=>[id,(['critical','warning','normal'] as const).reduce((best,tone)=>count[tone]>count[best]?tone:best,'critical')]));
}
