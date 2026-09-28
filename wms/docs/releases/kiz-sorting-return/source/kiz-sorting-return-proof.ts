import type { Prisma } from '@prisma/client';
import { physicalKizIdentity } from './kiz-physical-identity';
export const manualKizIdentity = (v: string) => physicalKizIdentity(v.replace(/^\(01\)(\d{14})\(21\)/, '01$121').replace(/^(01\d{14})\u001d21/, '$121'));
export const manualKizPrefixes = (identity: string) => [identity, ']d2'+identity, ']D2'+identity, '(01)'+identity.slice(2,16)+'(21)'+identity.slice(18), identity.slice(0,16)+'\u001d'+identity.slice(16)];

// FIX: a box balance alone is not proof that this particular unit returned after shipment.
export async function findSortingReturnProof(tx: Prisma.TransactionClient, clientId: string, identity: string,
  links: Array<{ id: string; completedAt: Date | null }>) {
  if (!links.length || links.some(t => !t.completedAt)) return null;
  const marks = (await tx.productMark.findMany({ where: { clientId,
    OR: manualKizPrefixes(identity).map(p => ({ value: { startsWith: p } })) } }))
    .filter(m => manualKizIdentity(m.value) === identity);
  if (marks.length !== 1 || marks[0].status !== 'AVAILABLE' || !marks[0].boxId) return null;
  const mark = marks[0];
  const shipments = await tx.shippedKizHistory.findMany({ where: { clientId, assemblyId: { in: links.map(t => t.id) } } });
  if (links.some(t => !shipments.some(h => h.assemblyId === t.id && manualKizIdentity(h.kiz) === identity))) return null;
  const after = new Date(Math.max(...links.map(t => t.completedAt!.getTime()), ...shipments.map(h => h.shippedAt.getTime())));
  const audit = await tx.auditLog.findFirst({ where: {
    action: { in: ['PALLET_SORTING_UNIT_MOVED', 'PALLET_SORTING_UNIT_RECOVERED'] },
    entity: 'PalletSortingSession', createdAt: { gt: after },
    AND: [{ payload: { path: ['identity'], equals: identity } },
      { payload: { path: ['markId'], equals: mark.id } },
      { payload: { path: ['targetBoxId'], equals: mark.boxId! } }],
  }, orderBy: { createdAt: 'desc' } });
  const proof = audit?.payload as Record<string, unknown> | undefined;
  if (!audit?.userId || !proof || proof.physicalTruth !== true || proof.quantity !== 1 ||
    proof.targetClientId !== clientId || proof.skuId !== mark.skuId || typeof proof.movementId !== 'string') return null;
  const movement = await tx.stockMovement.findFirst({ where: { id: proof.movementId, clientId,
    skuId: mark.skuId, boxId: mark.boxId, warehouseId: String(proof.targetWarehouseId), status: 'AVAILABLE',
    quantity: { gt: 0 }, createdAt: { gt: after } } });
  if (!movement) return null;
  return { auditId: audit.id, movementId: movement.id, markId: mark.id, boxId: mark.boxId,
    sortedAt: audit.createdAt, previousShipmentAt: after };
}
