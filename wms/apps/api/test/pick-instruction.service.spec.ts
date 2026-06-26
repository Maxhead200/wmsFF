import { BadRequestException } from '@nestjs/common';
import { ClientRequestPriority, ClientRequestStatus, ClientRequestType, StockStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { ClientScopeService } from '../src/modules/auth/client-scope.service';
import { PickInstructionService } from '../src/modules/stock/pick-instruction.service';

describe('PickInstructionService', () => {
  it('строит план отбора по коробам без движения остатков', async () => {
    const prisma = {
      clientRequest: {
        findUnique: vi.fn().mockResolvedValue(requestFixture()),
      },
      barcode: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          balanceFixture({ id: 'balance-1', boxId: 'box-1', boxCode: 'BOX-1', quantity: 2 }),
          balanceFixture({ id: 'balance-2', boxId: 'box-2', boxCode: 'BOX-2', quantity: 5 }),
        ]),
        groupBy: vi.fn().mockResolvedValue([
          { boxId: 'box-1', _sum: { quantity: 2 } },
          { boxId: 'box-2', _sum: { quantity: 5 } },
        ]),
      },
    };
    const service = new PickInstructionService(prisma as never, new ClientScopeService());

    const document = await service.getRequestInstruction('request-1', user({ clientIds: ['client-1'] }));

    expect(document.totalRequested).toBe(4);
    expect(document.totalAllocated).toBe(4);
    expect(document.totalShortage).toBe(0);
    expect(document.rows[0]).toMatchObject({
      status: 'READY',
      allocatedQuantity: 4,
      shortageQuantity: 0,
      allocations: [
        { balanceId: 'balance-1', boxCode: 'BOX-1', quantity: 2 },
        { balanceId: 'balance-2', boxCode: 'BOX-2', quantity: 2 },
      ],
    });
    expect(document.boxes).toEqual([
      expect.objectContaining({ boxCode: 'BOX-1', allocatedQuantity: 2, availableQuantity: 2, isFullBox: true }),
      expect.objectContaining({ boxCode: 'BOX-2', allocatedQuantity: 2, availableQuantity: 5, isFullBox: false }),
    ]);
    expect(document.html).toContain('Инструкция сборки');
  });

  it('показывает дефицит, если доступного остатка не хватает', async () => {
    const prisma = {
      clientRequest: {
        findUnique: vi.fn().mockResolvedValue(requestFixture({ quantity: 6 })),
      },
      barcode: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          balanceFixture({ id: 'balance-1', boxId: 'box-1', boxCode: 'BOX-1', quantity: 2 }),
        ]),
        groupBy: vi.fn().mockResolvedValue([{ boxId: 'box-1', _sum: { quantity: 2 } }]),
      },
    };
    const service = new PickInstructionService(prisma as never, new ClientScopeService());

    const document = await service.getRequestInstruction('request-1', user({ clientIds: ['client-1'] }));

    expect(document.totalAllocated).toBe(2);
    expect(document.totalShortage).toBe(4);
    expect(document.rows[0]).toMatchObject({
      status: 'SHORTAGE',
      statusLabel: 'Дефицит',
      comment: 'Не хватает 4 шт. в AVAILABLE.',
    });
  });

  it('экспортирует складскую инструкцию в XLSX', async () => {
    const prisma = {
      clientRequest: {
        findUnique: vi.fn().mockResolvedValue(requestFixture()),
      },
      barcode: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          balanceFixture({ id: 'balance-1', boxId: 'box-1', boxCode: 'BOX-1', quantity: 2 }),
          balanceFixture({ id: 'balance-2', boxId: 'box-2', boxCode: 'BOX-2', quantity: 5 }),
        ]),
        groupBy: vi.fn().mockResolvedValue([
          { boxId: 'box-1', _sum: { quantity: 2 } },
          { boxId: 'box-2', _sum: { quantity: 5 } },
        ]),
      },
    };
    const service = new PickInstructionService(prisma as never, new ClientScopeService());

    const file = await service.getRequestInstructionXlsx('request-1', user({ clientIds: ['client-1'] }));
    const workbook = XLSX.read(file.content, { type: 'buffer' });

    expect(file.fileName).toMatch(/\.xlsx$/);
    expect(file.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(workbook.SheetNames).toEqual(['Сводка', 'Инструкция', 'Целые короба', 'МАРК', 'План WMS', 'Короба', 'Дефицит']);
    const instructionRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Инструкция'], { defval: '' });
    const wmsRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['План WMS'], { defval: '' });
    const boxRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Короба'], { defval: '' });

    expect(instructionRows[0]).toMatchObject({ 'Исходный короб': 'BOX-1', Количество: 2 });
    expect(wmsRows[0]).toMatchObject({ Короб: 'BOX-1', Взять: 2 });
    expect(wmsRows[1]).toMatchObject({ Короб: 'BOX-2', Взять: 2 });
    expect(boxRows[0]).toMatchObject({ Короб: 'BOX-1', 'Целый короб': 'Да' });
  });

  it('отклоняет инструкцию для не outbound-заявки', async () => {
    const prisma = {
      clientRequest: {
        findUnique: vi.fn().mockResolvedValue(requestFixture({ type: ClientRequestType.INBOUND })),
      },
    };
    const service = new PickInstructionService(prisma as never, new ClientScopeService());

    await expect(service.getRequestInstruction('request-1', user({ clientIds: ['client-1'] }))).rejects.toThrow(BadRequestException);
  });
});

function requestFixture(overrides: { quantity?: number; type?: ClientRequestType } = {}) {
  return {
    id: 'request-1',
    clientId: 'client-1',
    title: 'Excel сборка',
    type: overrides.type ?? ClientRequestType.OUTBOUND,
    status: ClientRequestStatus.SUBMITTED,
    priority: ClientRequestPriority.NORMAL,
    deliveryAddress: 'Москва',
    desiredDate: new Date('2026-06-30T00:00:00.000Z'),
    client: {
      id: 'client-1',
      code: 'CLIENT',
      name: 'Client',
    },
    items: [
      {
        id: 'item-1',
        skuId: 'sku-1',
        barcode: '460000000001',
        name: null,
        quantity: overrides.quantity ?? 4,
        comment: null,
        sku: {
          id: 'sku-1',
          clientId: 'client-1',
          internalSku: 'SKU-1',
          clientSku: null,
          article: null,
          name: 'Товар 1',
          brand: null,
          category: null,
          color: null,
          size: null,
          weightGrams: null,
          lengthCm: null,
          widthCm: null,
          heightCm: null,
          volumeLiters: null,
          volumeSource: 'MANUAL',
          needsChestnyZnak: false,
          isUnmarked: false,
          needsLabel: false,
          needsRelabel: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          barcodes: [{ value: '460000000001', isPrimary: true }],
        },
      },
    ],
  };
}

function balanceFixture(input: { id: string; boxId: string; boxCode: string; quantity: number }) {
  return {
    id: input.id,
    balanceKey: `key-${input.id}`,
    clientId: 'client-1',
    skuId: 'sku-1',
    boxId: input.boxId,
    palletId: 'pallet-1',
    status: StockStatus.AVAILABLE,
    quantity: input.quantity,
    updatedAt: new Date(),
    box: { id: input.boxId, code: input.boxCode },
    pallet: { id: 'pallet-1', code: 'PALLET-1' },
  };
}

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleCodes: ['MANAGER'],
    permissionCodes: ['stock:write'],
    clientScopeMode: 'LIMITED',
    clientIds: [],
    writableClientIds: [],
    ...overrides,
  };
}
