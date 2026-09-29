import type { ClientRequestSummary, ClientRequestManualBoxSelection, updateClientRequestStatus } from '../../lib/api';
import { requestStatusOptions } from './clientRequestMeta';
// FIX: process order rather than alphabetical status codes; deterministic ties.
export function compareRequestStatus(a: ClientRequestSummary, b: ClientRequestSummary) {
  return requestStatusOptions.findIndex(x => x.value === a.status) - requestStatusOptions.findIndex(x => x.value === b.status) || a.number - b.number;
}
export function canBatchComplete(r: ClientRequestSummary) { return !['DONE', 'CANCELLED', 'REJECTED'].includes(r.status); }
export function needsManualStockClose(r: ClientRequestSummary) {
  return ['OUTBOUND', 'DELIVERY'].includes(r.type) && r.items.length > 0 && !r.comment?.toLocaleLowerCase('ru-RU').includes('создано из excel:');
}
// FIX: missing stock is not permission to discard a known source.
export function missingSourceOnly(items: ClientRequestManualBoxSelection['items']) {
  return items.filter(i => i.boxes.length === 0 && !(i.selectedQuantity > 0) && !i.fbsOrders.some(o => Boolean(o.boxCode?.trim())))
    .map(i => ({ requestItemId: i.requestItemId, noBox: true as const, quantity: i.requestedQuantity }));
}
// FIX: reuse recorded packaging quantities; no automatic overweight override.
export function batchDonePayload(request: ClientRequestSummary, boxes: number, selection: ClientRequestManualBoxSelection | null): Parameters<typeof updateClientRequestStatus>[2] {
  const payload: Parameters<typeof updateClientRequestStatus>[2] = {status:'DONE',managerComment:'Массовая сдача из WMS. Без короба только при отсутствии источника хранения.'};
  if (!needsManualStockClose(request)) return payload;
  const recorded = request.status === 'PACKED' && request.packages.length > 0;
  const isPallet = (type?: string | null) => ['PALLET','PALLETTE','ПАЛЛЕТ','ПАЛЛЕТА'].includes((type ?? '').trim().toUpperCase());
  const sources = selection ? missingSourceOnly(selection.items) : [];
  const packedUnits = request.packages.reduce((sum,p)=>sum+p.items.reduce((n,i)=>n+i.quantity,0),0);
  return {...payload,
    boxes: recorded ? request.packages.filter(p=>!isPallet(p.packageType)).length : boxes,
    pallets: recorded ? request.packages.filter(p=>isPallet(p.packageType)).length : 0,
    packedUnits: recorded && packedUnits ? packedUnits : request.items.reduce((sum,i)=>sum+i.quantity,0),
    stockSources: sources.length ? sources : undefined,
    allowOverweightPackages:false,
  };
}
// FIX: sequential operations keep partial results and never retry a successful mutation.
export async function runRequestBatch<T extends {id: string}>(items: T[], action: (item: T) => Promise<unknown>) {
  const results: Array<{id: string; ok: boolean; error?: string}> = [];
  for (const item of items) {
    try { await action(item); results.push({id: item.id, ok: true}); }
    catch(error) { results.push({id: item.id, ok: false, error: error instanceof Error ? error.message : String(error)}); }
  }
  return results;
}
