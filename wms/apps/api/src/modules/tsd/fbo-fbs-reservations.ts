import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type Balance = { boxId: string | null; skuId: string; quantity: number };
type Reservation = { skuId: string; sourceSkuId: string | null; relabelConfirmedAt: Date | null;
  boxId: string | null; reservedBoxId: string | null; itemCount: number };
const key = (box: string, sku: string) => `${box}:${sku}`;

// FIX: keep both a box limit and a warehouse limit for orders awaiting a box route.
export class FboFbsAvailability {
  private readonly boxes = new Map<string, number>();
  private readonly warehouse = new Map<string, number>();
  constructor(balances: Balance[], tasks: Reservation[]) {
    for (const b of balances) {
      if (!b.boxId || b.quantity <= 0) continue;
      const k = key(b.boxId, b.skuId);
      this.boxes.set(k, (this.boxes.get(k) ?? 0) + b.quantity);
      this.warehouse.set(b.skuId, (this.warehouse.get(b.skuId) ?? 0) + b.quantity);
    }
    for (const t of tasks) {
      const sku = t.sourceSkuId && !t.relabelConfirmedAt ? t.sourceSkuId : t.skuId;
      const qty = Math.max(1, t.itemCount), box = t.boxId ?? t.reservedBoxId;
      this.warehouse.set(sku, (this.warehouse.get(sku) ?? 0) - qty);
      if (box) this.boxes.set(key(box, sku), (this.boxes.get(key(box, sku)) ?? 0) - qty);
    }
  }
  free(box: string, sku: string) {
    return Math.max(0, Math.min(this.boxes.get(key(box, sku)) ?? 0, this.warehouse.get(sku) ?? 0));
  }
  take(box: string, sku: string, quantity: number) {
    if (quantity > this.free(box, sku))
      throw new ConflictException('Товар зарезервирован для FBS. Обновите маршрут ФБО и отберите только свободное количество.');
    this.boxes.set(key(box, sku), (this.boxes.get(key(box, sku)) ?? 0) - quantity);
    this.warehouse.set(sku, (this.warehouse.get(sku) ?? 0) - quantity);
  }
}

// FIX: run inside the existing serializable pick transaction, before any stock/KIZ writes.
export async function loadFboFbsAvailability(tx: Prisma.TransactionClient,
  request: { clientId: string; warehouseId: string | null }, skuIds: string[]) {
  const balances = await tx.stockBalance.findMany({ where: { clientId: request.clientId,
    warehouseId: request.warehouseId, skuId: { in: skuIds }, status: 'AVAILABLE', quantity: { gt: 0 },
    box: { status: 'active', clientId: request.clientId, warehouseId: request.warehouseId } },
    select: { boxId: true, skuId: true, quantity: true } });
  const requestIds = await tx.clientRequest.findMany({ where: { clientId: request.clientId,
    warehouseId: request.warehouseId, status: { notIn: ['DONE', 'CANCELLED', 'REJECTED'] } }, select: { id: true } });
  const tasks = await tx.fbsTsdAssembly.findMany({ where: { clientId: request.clientId,
    status: { in: ['WAITING_STOCK', 'RESERVED', 'IN_PROGRESS', 'RESCAN_REQUIRED', 'RETURN_REQUIRED', 'COMPLETED'] },
    AND: [{ OR: [{ skuId: { in: skuIds } }, { sourceSkuId: { in: skuIds } }] },
      { OR: [{ stockWarehouseId: request.warehouseId },
        { stockWarehouseId: null, requestId: { in: requestIds.map(r => r.id) } },
        { boxId: { in: balances.flatMap(b => b.boxId ? [b.boxId] : []) } },
        { reservedBoxId: { in: balances.flatMap(b => b.boxId ? [b.boxId] : []) } }] }] },
    select: { id: true, requestId: true, connectionId: true, orderId: true, status: true,
      sourceBarcode: true, barcode: true, kiz: true,
      skuId: true, sourceSkuId: true, relabelConfirmedAt: true, itemCount: true, boxId: true, reservedBoxId: true } });
  // FIX: physical picking already reduced AVAILABLE; do not subtract that stock twice.
  const taskRequestIds = [...new Set(tasks.map(t => t.requestId))];
  const movements = tasks.length ? await tx.stockMovement.findMany({where:{clientId:request.clientId,
    sourceDocument:{in:taskRequestIds},skuId:{in:skuIds},status:'PACKING',
    idempotencyKey:{startsWith:'fbs-sticker-pick:'}},select:{idempotencyKey:true,quantity:true}}) : [];
  const picked = new Map<string, number>();
  for (const movement of movements) {
    const id = movement.idempotencyKey!.slice('fbs-sticker-pick:'.length).split(':',1)[0];
    picked.set(id,(picked.get(id) ?? 0)+movement.quantity);
  }
  const openRequests = tasks.length ? await tx.clientRequest.findMany({where:{id:{in:taskRequestIds},
    status:{notIn:['DONE','CANCELLED','REJECTED']}},select:{id:true}}) : [];
  const open = new Set(openRequests.map(r=>r.id));
  const shipped = tasks.length ? await tx.fbsOrderRequestLink.findMany({where:{requestId:{in:taskRequestIds},
    lastCategory:{in:['shipped','archive']},lastSupplierStatus:'complete',request:{fbsEmergencyAssemblyAt:null}},
    select:{connectionId:true,orderId:true}}) : [];
  const shippedOrders = new Set(shipped.map(l=>`${l.connectionId}:${l.orderId}`));
  const pending = tasks.filter(t => t.status === 'RETURN_REQUIRED' ||
    (t.status === 'IN_PROGRESS' && !!(t.sourceBarcode || t.barcode || t.kiz || t.relabelConfirmedAt)) ||
    (open.has(t.requestId) && !shippedOrders.has(`${t.connectionId}:${t.orderId}`)))
    .map(t => ({...t,itemCount:Math.max(1,t.itemCount)-Math.max(0,picked.get(t.id) ?? 0)}))
    .filter(t => t.itemCount > 0);
  return new FboFbsAvailability(balances, pending);
}
