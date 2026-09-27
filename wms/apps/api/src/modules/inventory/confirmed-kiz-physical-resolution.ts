import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { physicalKizIdentity } from '../../common/kiz-physical-identity';

type Mark = Prisma.ProductMarkGetPayload<{ include: { box: { select: { warehouseId: true } } } }>;
// FIX: invoked only after the current recount's unique scans, quantities and access
// were validated and both boxes locked. Destination stock is ALREADY counted.
export async function resolveConfirmedPhysicalKiz(tx: Prisma.TransactionClient, input: {
  marks: Mark[]; scans: Array<{ identity: string; value: string; skuId: string }>;
  box: { id: string; clientId: string; warehouseId: string | null };
  auditId: string; startedAt: Date;
}, user: AuthUser) {
  if (process.env.WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED !== 'true' || user.isDemo ||
      !user.roleCodes.some(r => r === 'ADMIN' || r === 'OWNER')) return;
  const { marks, scans, box, auditId, startedAt } = input;
  const fail = (message: string): never => { throw new ConflictException(message); };
  for (const scan of scans) {
    const matches = marks.filter(m => physicalKizIdentity(m.value) === scan.identity);
    // Existing duplicate handling remains responsible for ambiguous registrations.
    if (matches.length !== 1) continue;
    const mark = matches[0];
    if (mark.status === 'AVAILABLE' && mark.skuId === scan.skuId) continue;
    if (mark.clientId !== box.clientId || mark.box?.warehouseId && mark.box.warehouseId !== box.warehouseId)
      fail('Подтверждение КИЗ: другой клиент или филиал.');
    if (!mark.updatedAt || mark.updatedAt >= startedAt)
      fail('КИЗ изменён после начала пересчёта. Нужен свежий физический скан.');
    const prefixes = [scan.identity, ']d2' + scan.identity, ']D2' + scan.identity]
      .map(value => value.replace(/[\\%_]/g, '\\$&'));
    const where = { OR: prefixes.map(prefix => ({ kiz: { startsWith: prefix } })) };
    // A historical status is recoverable. A concurrent live pick requires its own
    // atomic return operation; never silently erase another worker's current pick.
    const [fbs, fbo] = await Promise.all([
      tx.fbsTsdAssembly.findFirst({ where: { ...where, status: { notIn: ['COMPLETED', 'WB_ACCOUNTED', 'RELEASED'] } }, select: { id: true } }),
      tx.fboAssemblyUnit.findFirst({ where: { OR: [{ activeMarkId: mark.id }, { ...where, state: { in: ['PICKED', 'PACKED'] } }] }, select: { id: true } }),
    ]);
    if (fbs || fbo) fail('КИЗ используется текущей сборкой. Требуется оформить возврат из этой сборки.');
    const previousMark = JSON.parse(JSON.stringify(mark));
    let sourceBalance: unknown = null;
    let movementId: string | null = null;
    if (mark.boxId && mark.boxId !== box.id) {
      const source = await tx.box.findUnique({ where: { id: mark.boxId } });
      if (!source || source.clientId !== box.clientId || source.warehouseId !== box.warehouseId)
        fail('Изменилась принадлежность исходного короба.');
      const rows = await tx.stockBalance.findMany({ where: { boxId: mark.boxId, clientId: mark.clientId, skuId: mark.skuId }, orderBy: { id: 'asc' } });
      if (rows.some(r => r.quantity < 0 || r.warehouseId !== box.warehouseId)) fail('Некорректный остаток исходного короба.');
      // BLOCKED/SHIPPING must never consume another available unit: their earlier
      // physical deduction remains valid. Only their own current status is settled.
      const balance = mark.status === 'SHIPPING' ? undefined : rows.find(r => r.status === mark.status && r.quantity > 0);
      if (balance) {
        const changed = await tx.stockBalance.updateMany({ where: { id: balance.id, updatedAt: balance.updatedAt, quantity: balance.quantity }, data: { quantity: { decrement: 1 } } });
        if (changed.count !== 1) fail('Исходный остаток изменился параллельно.');
        sourceBalance = balance;
        const out = await tx.stockMovement.create({ data: { clientId: mark.clientId, warehouseId: source!.warehouseId,
          skuId: mark.skuId, boxId: source!.id, palletId: balance.palletId, status: balance.status,
          type: 'INVENTORY_ADJUSTMENT', quantity: -1, sourceDocument: `inventory-physical-resolution:${auditId}`,
          idempotencyKey: `inventory-physical-resolution:${auditId}:${mark.id}:out`,
          comment: 'Подтверждение фактического скана администратором. Целевой остаток уже учтён пересчётом.' } });
        movementId = out.id;
      }
    }
    const changed = await tx.productMark.updateMany({ where: { id: mark.id, updatedAt: mark.updatedAt, boxId: mark.boxId, status: mark.status, skuId: mark.skuId },
      data: { boxId: box.id, skuId: scan.skuId, status: 'AVAILABLE', stockMovementId: null } });
    if (changed.count !== 1) fail('КИЗ изменился параллельно с подтверждением.');
    await tx.auditLog.create({ data: { userId: user.id, action: 'INVENTORY_PHYSICAL_KIZ_RESOLVED', entity: 'InventoryAuditBox', entityId: auditId,
      payload: JSON.parse(JSON.stringify({ previousMark, sourceBalance, movementId, identity: scan.identity,
        targetBoxId: box.id, targetSkuId: scan.skuId, targetAlreadyCounted: true, historicalShipmentsPreserved: true })) } });
    const updated = await tx.productMark.findUniqueOrThrow({ where: { id: mark.id } });
    Object.assign(mark, updated, { box: { warehouseId: box.warehouseId } });
  }
}
