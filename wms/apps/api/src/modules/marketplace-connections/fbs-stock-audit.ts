import { physicalKizIdentity, kizIdentityTransferEnabled, physicalKizLookup } from '../../common/kiz-physical-identity';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { FbsTsdAssembly, Prisma } from '@prisma/client';
import { confirmedKizCompositionId } from '../inventory/confirmed-kiz-composition';

export const FBS_KIZ_AUDIT_MARKER = '[FBS_KIZ_STOCK_CHECK]';
export const fbsKizAuditEnabled = () => process.env.WMS_FBS_KIZ_MANDATORY_AUDIT === 'true';

// FIX: keep legacy errors outside our opt-in deployment; carry authoritative task/box scope to the TSD.
export function fbsStockAuditError(task: Partial<FbsTsdAssembly>, message: string) {
  return new BadRequestException(fbsKizAuditEnabled() && task.id && task.clientId && task.boxId && task.boxCode
    ? { code: 'FBS_STOCK_AUDIT_REQUIRED', message, taskId: task.id, clientId: task.clientId, boxCode: task.boxCode }
    : message);
}

const identity = (value: string) => kizIdentityTransferEnabled() ? physicalKizIdentity(value) : /^(01\d{14}21[^\u0000-\u001f]{13})(?:\u001d|$)/
  .exec(value.replace(/^\]d2/i, '').replace(/<GS>/gi, '\u001d'))?.[1] ?? '';

// FIX: this is a read-only return gate, never a KIZ replacement, WB undo or second stock debit.
// Quantity-only inventory resolution cannot prove that the physical KIZ composition was repaired.
export async function validateFbsStockAudit(db: Prisma.TransactionClient, task: FbsTsdAssembly, sessionId: string, userId: string, roleCodes: readonly string[] = []) {
  const stop = (message: string): never => { throw new ConflictException({ code: 'FBS_STOCK_AUDIT_PENDING', message }); };
  const session = await db.inventorySession.findUnique({ where: { id: sessionId }, include: {
    boxes: { include: { lines: true } },
  } });
  const activePick = task.status === 'IN_PROGRESS';
  if (!session || session.type !== 'BOX_CHECK' || session.clientId !== task.clientId || session.createdByUserId !== userId ||
      !session.comment?.includes(`${FBS_KIZ_AUDIT_MARKER} ${task.id};`) || session.boxes.length !== 1 ||
      (activePick && session.boxes[0].boxId !== task.boxId)) stop('Проверка не относится к этому заказу и коробу. Откройте обязательную проверку заново.');
  const audit = session!.boxes[0];
  if (session!.status !== 'COMPLETED' || !['MATCHED', 'RESOLVED'].includes(audit.status) ||
      audit.lines.some(line => line.difference !== 0 && line.decision === 'PENDING')) {
    stop('Сначала завершите пересчёт и разбор расхождений короба.');
  }
  const [box, request] = await Promise.all([
    db.box.findUnique({ where: { id: audit.boxId } }),
    db.clientRequest.findUnique({ where: { id: task.requestId }, select: { warehouseId: true } }),
  ]);
  // FIX: administrator sessions may be unrestricted; the physical box must still match the request warehouse.
  if (!box || !request || box.clientId !== task.clientId || !box.warehouseId ||
      (session!.warehouseId !== null && box.warehouseId !== session!.warehouseId) || box.warehouseId !== request.warehouseId ||
      !['active', 'receiving'].includes(box.status)) stop('Короб изменил филиал, клиента или статус. Нужен разбор администратора.');
  const [marks, balances, evidence] = await Promise.all([
    db.productMark.findMany({ where: { boxId: audit.boxId } }),
    db.stockBalance.findMany({ where: { boxId: audit.boxId } }),
    db.auditLog.findMany({ where: { action: 'INVENTORY_KIZ_SCAN', entity: 'InventoryAuditBox', entityId: audit.id,
      createdAt: { gte: audit.startedAt } } }),
  ]);
  const skuIds = [...new Set([...audit.lines.map(line => line.skuId), ...marks.map(mark => mark.skuId), ...balances.map(row => row.skuId)])];
  const skus = await db.sku.findMany({ where: { id: { in: skuIds } }, select: { id: true, internalSku: true, needsChestnyZnak: true, isUnmarked: true } });
  if (skus.length !== skuIds.length) stop('Не все товары короба найдены. Нужен разбор администратора.');
  // FIX: administrator-confirmed historical packing remains in its shipment ledger,
  // but is outside the physical contents that the worker has just counted.
  const confirmation = fbsKizAuditEnabled() ? await db.auditLog.findUnique({ where: { id: confirmedKizCompositionId(audit.id, audit.startedAt) } }) : null;
  const confirmed = confirmation?.payload as { auditBoxId?: string; boxId?: string; clientId?: string; warehouseId?: string;
    roundStartedAt?: string; nonPhysicalBalances?: Array<{ id: string; skuId: string; status: string; quantity: number }> } | null;
  const approved = confirmation?.action === 'INVENTORY_KIZ_COMPOSITION_CONFIRMED' && confirmed?.auditBoxId === audit.id &&
    confirmed.boxId === audit.boxId && confirmed.clientId === task.clientId && confirmed.warehouseId === box!.warehouseId &&
    confirmed.roundStartedAt === audit.startedAt.toISOString();
  const isHistorical = (row: (typeof balances)[number]) => approved && ['PACKING', 'SHIPPING'].includes(row.status) &&
    confirmed?.nonPhysicalBalances?.some(previous => previous.id === row.id && previous.skuId === row.skuId &&
      previous.status === row.status && row.quantity <= previous.quantity);
  if (balances.some(row => row.clientId !== task.clientId || row.warehouseId !== box!.warehouseId ||
      row.quantity < 0 || (row.status !== 'AVAILABLE' && row.quantity !== 0 && !isHistorical(row)))) {
    stop('В коробе есть резерв, недоступный остаток или другая принадлежность. Нужен разбор администратора.');
  }
  for (const sku of skus) {
    const line = audit.lines.find(row => row.skuId === sku.id);
    const quantity = balances.filter(row => row.skuId === sku.id && row.status === 'AVAILABLE').reduce((n, row) => n + row.quantity, 0);
    // FIX: the privileged picker may explicitly retain their own unchanged system stock.
    // This accepts the discrepancy, without fabricating scans or changing inventory.
    const acceptedAsIs = process.env.WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED === 'true' &&
      roleCodes.some(role => role === 'ADMIN' || role === 'OWNER') && activePick && task.workerUserId === userId &&
      line?.decision === 'KEEP_SYSTEM' && line.decisionComment?.startsWith('[ACCEPT_AS_IS]') &&
      line.decidedByUserId === userId && line.decidedAt && line.decidedAt >= audit.startedAt &&
      quantity === line.expectedQuantity && balances.filter(row => row.skuId === sku.id)
        .every(row => !row.updatedAt || row.updatedAt <= line.decidedAt!);
    if (!acceptedAsIs && quantity !== (line?.countedQuantity ?? 0)) {
      // FIX: distinguish a changed stock quantity from a KIZ composition mismatch.
      const details = process.env.WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED === 'true'
        ? ` Товар: ${sku.internalSku || sku.id}. В текущем остатке: ${quantity} шт.; в сохранённом пересчёте: ${line?.countedQuantity ?? 0} шт.` : '';
      stop('Остаток после пересчёта не совпадает с фактом. Актуализируйте короб с администратором.' + details);
    }
    if (!sku.needsChestnyZnak || sku.isUnmarked) continue;
    const scans = evidence.map(row => row.payload as Record<string, unknown> | null).filter(row =>
      row?.skuId === sku.id && row.roundStartedAt === audit.startedAt.toISOString() && row.clientId === task.clientId &&
      row.boxId === audit.boxId && row.sessionId === sessionId && typeof row.kiz === 'string');
    const scanned = new Set(scans.map(row => identity(row!.kiz as string)));
    const registered = marks.filter(row => row.skuId === sku.id);
    // Missing KIZs are allowed only for the existing quantity-only imported-stock gap.
    // An absent old KIZ is never retired or overwritten by this gate.
    if ((!acceptedAsIs && (scanned.has('') || scanned.size !== quantity)) || registered.some(row => row.clientId !== task.clientId ||
        row.status !== 'AVAILABLE' || !identity(row.value) || (!acceptedAsIs && !scanned.has(identity(row.value)))) ||
        (acceptedAsIs && registered.length > quantity) ||
        new Set(registered.map(row => identity(row.value))).size !== registered.length) {
      // FIX: explain the mismatched physical identities using already loaded, scoped records.
      let details = '';
      if (process.env.WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED === 'true') {
        const registeredIds = new Set(registered.map(row => identity(row.value)));
        const missing = [...scanned].filter(key => key && !registeredIds.has(key));
        const extra = [...registeredIds].filter(key => key && !scanned.has(key));
        const unavailable = registered.filter(row => row.status !== 'AVAILABLE');
        details = ` Товар: ${sku.internalSku || sku.id}. Остаток: ${quantity} шт.; сохранено уникальных сканов: ${[...scanned].filter(Boolean).length}; привязано КИЗ: ${registered.length}.`;
        if (missing.length) details += ` Отсканированы, но не привязаны к этому товару в коробе (${missing.length}): ${missing.slice(0, 5).join(', ')}.`;
        if (extra.length) details += ` Числятся у товара, но отсутствуют в сканах (${extra.length}): ${extra.slice(0, 5).join(', ')}.`;
        if (unavailable.length) details += ` Недоступные КИЗ (${unavailable.length}): ${unavailable.slice(0, 5).map(row => `${identity(row.value)} — ${row.status}`).join(', ')}.`;
        if (registeredIds.size !== registered.length) details += ' Есть повторные привязки одного КИЗ.';
        if (scanned.has('')) details += ' Есть скан с нераспознанным форматом КИЗ.';
      }
      stop('Количество проверено, но состав КИЗ не подтверждён. Администратору нужно разобрать привязки КИЗ; сборка остаётся на проверке.' + details);
    }
  }
  // FIX: an already picked unit is outside the storage box. Never ask to count it back into that box.
  // A cancellation/return is handled only by the separate scanned return-receipt workflow.
  if (activePick && task.wbMetaStatus === 'ACCEPTED' && task.kiz) {
    const movements = await db.stockMovement.findMany({ where: {
      idempotencyKey: { startsWith: `fbs-sticker-pick:${task.id}:` },
      OR: [{ status: 'PACKING' }, { type: 'RETURN', status: 'SHIPPING', quantity: { lt: 0 } }],
    }, select: { quantity: true } });
    const picked = movements.reduce((n, row) => n + row.quantity, 0) >= Math.max(1, task.itemCount);
    const mark = await db.productMark.findFirst({ where: { clientId: task.clientId, skuId: task.skuId,
      ...await physicalKizLookup(db, task.kiz, false), status: picked ? 'PACKING' : 'AVAILABLE', ...(picked ? {} : { boxId: audit.boxId }) } });
    if (!mark) stop('Не подтверждён остаток для принятого WB КИЗ. Привязка WB сохранена; нужен разбор администратора.');
  }
  return { ready: true, taskId: task.id, sessionId, boxCode: audit.boxCode };
}
