import { Injectable } from '@nestjs/common';

export type StockMovementDraft = {
  clientId: string;
  skuId: string;
  boxId?: string;
  palletId?: string;
  quantity: number;
  status: 'AVAILABLE' | 'UNMARKED' | 'QUARANTINE' | 'DEFECT' | 'BLOCKED';
  type: 'INITIAL_IMPORT' | 'RECEIPT' | 'MOVE' | 'INVENTORY_ADJUSTMENT';
  idempotencyKey: string;
  comment?: string;
};

@Injectable()
export class StockLedgerService {
  buildInitialImportMovement(input: Omit<StockMovementDraft, 'type' | 'status'> & { status?: StockMovementDraft['status'] }) {
    // Русский комментарий: начальная загрузка остатков тоже идёт через ledger, чтобы история не терялась.
    return {
      ...input,
      type: 'INITIAL_IMPORT' as const,
      status: input.status ?? ('AVAILABLE' as const),
    };
  }

  summarizeBySku(movements: StockMovementDraft[]) {
    return movements.reduce<Record<string, number>>((acc, movement) => {
      acc[movement.skuId] = (acc[movement.skuId] ?? 0) + movement.quantity;
      return acc;
    }, {});
  }
}
