import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findSortingReturnProof } from './kiz-sorting-return-proof';
import { manualKizIdentity, manualKizPrefixes } from './kiz-sorting-return-proof';

// FIX: opt-in for our WMS. Unknown circulation permits human review, never automatic reuse.
export const cancelledKizReviewEnabled = () => process.env.WMS_KIZ_CANCELLED_ADMIN_REUSE_ENABLED === 'true';
export const cancelledWithoutSale = (status?: string) => ['canceled', 'canceled_by_client', 'declined_by_client'].includes(status ?? '');
type Evidence = { checkedAt: string; decision: string; circulation: string | null;
  orders: Array<{orderId: string; verified: boolean; supplierStatus?: string; wbStatus?: string; containsKiz?: boolean}> };

// FIX: preserve shipment records and the complete historical task before releasing its unique live slot.
// The caller must first check admin rights, current unit/box/balance and confirmation of physical presence.
export async function releaseCancelledBindings(tx: Prisma.TransactionClient, clientId: string, kiz: string,
  evidence: Evidence, userId: string, reviewId: string, excludedTaskId = '', physicalConfirmation = false) {
  const conflict = () => new ConflictException('КИЗ занят другой сборкой или отмена прежнего заказа не подтверждена. Обновите проверку.');
  // FIX: only the authenticated, confirmed manager action may review unknown WB history.
  const physicalReview = physicalConfirmation && process.env.WMS_KIZ_PHYSICAL_REVIEW_ENABLED === 'true';
  const age = Date.now() - Date.parse(evidence.checkedAt);
  if (!cancelledKizReviewEnabled() || evidence.decision !== 'REVIEW' ||
    ['RETIRED', 'WRITTEN_OFF'].includes(evidence.circulation ?? '') || !Number.isFinite(age) || age < 0 || age > 60000 ||
    !evidence.orders.length || (!physicalReview && !evidence.orders.every(o => o.verified))) throw conflict();
  const identity = manualKizIdentity(kiz);
  if (!identity) throw conflict();
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${identity},0))`;
  const links = (await tx.fbsTsdAssembly.findMany({where:{clientId,id:{not:excludedTaskId},
    OR:manualKizPrefixes(identity).map(p=>({kiz:{startsWith:p}}))}})).filter(t=>manualKizIdentity(t.kiz??'')===identity);
  const requests = await tx.clientRequest.findMany({where:{clientId,id:{in:links.map(t=>t.requestId)},status:{in:['DONE','CANCELLED','REJECTED']}}});
  if (links.some(t=>(t.status!=='COMPLETED' && !(physicalReview && t.status==='RELEASED')) || !t.completedAt || !requests.some(r=>r.id===t.requestId) ||
    !evidence.orders.some(o=>o.orderId===t.orderId))) throw conflict();
  const cancelled = evidence.orders.every(o => o.verified && o.supplierStatus === 'cancel' && cancelledWithoutSale(o.wbStatus));
  const eligibleSortingStatus = evidence.orders.every(o =>
    (o.verified && o.supplierStatus === 'cancel' && cancelledWithoutSale(o.wbStatus)) ||
    (o.verified && o.supplierStatus === 'complete' && o.wbStatus === 'sorted'));
  const uncertainHistory = physicalReview && evidence.orders.every(o => !o.verified ||
    (o.supplierStatus === 'cancel' && cancelledWithoutSale(o.wbStatus)) ||
    (o.supplierStatus === 'complete' && o.wbStatus === 'sorted'));
  // FIX: RELEASED alone is insufficient; require physical return evidence even for cancellation.
  const released = links.some(t => t.status === 'RELEASED');
  const proof = (!cancelled || released) && ((eligibleSortingStatus && process.env.WMS_KIZ_SORTING_ADMIN_REUSE_ENABLED === 'true') || uncertainHistory)
    ? await findSortingReturnProof(tx, clientId, identity, links) : null;
  if ((!cancelled || released) && !proof) throw conflict();
  for (const old of links) {
    const history = await tx.shippedKizHistory.findMany({where:{clientId,orderId:old.orderId,requestId:old.requestId,
      OR:manualKizPrefixes(identity).map(p=>({kiz:{startsWith:p}}))}});
    if (!history.some(h=>manualKizIdentity(h.kiz)===identity)) throw conflict();
    await tx.auditLog.create({data:{userId,action:proof && physicalReview ? 'KIZ_PHYSICAL_BINDING_ARCHIVED' : proof ? 'KIZ_SORTING_BINDING_ARCHIVED' : 'KIZ_CANCELLED_BINDING_ARCHIVED',entity:'FbsTsdAssembly',entityId:old.id,
      payload:JSON.parse(JSON.stringify({reviewId,kizIdentity:identity,evidence,physicalConfirmation:physicalReview,sortingProof:proof,before:old}))}});
    const changed = await tx.fbsTsdAssembly.updateMany({where:{id:old.id,clientId,status:old.status,kiz:old.kiz,updatedAt:old.updatedAt},data:{kiz:null}});
    if (changed.count!==1) throw conflict();
  }
}
