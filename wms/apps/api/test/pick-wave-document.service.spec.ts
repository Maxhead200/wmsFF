import { NotFoundException } from '@nestjs/common';
import { ClientRequestStatus, PickWaveRequestStatus, PickWaveStatus, StockStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { PickWaveDocumentService } from '../src/modules/stock/pick-wave-document.service';

describe('PickWaveDocumentService', () => {
  it('строит печатный лист плановой волны с подсказкой доступного короба', async () => {
    const prisma = {
      pickWave: {
        findUnique: vi.fn().mockResolvedValue(waveFixture()),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'balance-1',
            clientId: 'client-1',
            skuId: 'sku-1',
            boxId: 'box-1',
            palletId: 'pallet-1',
            status: StockStatus.AVAILABLE,
            quantity: 5,
            updatedAt: new Date('2026-06-26T09:00:00.000Z'),
            box: { id: 'box-1', code: 'BOX-A1' },
            pallet: { id: 'pallet-1', code: 'PAL-01' },
          },
        ]),
      },
      box: {
        findMany: vi.fn(),
      },
      pallet: {
        findMany: vi.fn(),
      },
    };
    const scopes = { requireClientAccess: vi.fn() };
    const service = new PickWaveDocumentService(prisma as never, scopes as never);

    const document = await service.getWaveDocument('wave-1', user());

    expect(scopes.requireClientAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'client-1', 'read');
    expect(document).toMatchObject({
      waveId: 'wave-1',
      waveNumber: 'WAVE-1',
      rowsCount: 1,
      totalRequested: 3,
      totalPicked: 0,
    });
    expect(document.rows[0].allocations).toEqual([
      expect.objectContaining({
        boxCode: 'BOX-A1',
        palletCode: 'PAL-01',
        quantity: 3,
        source: 'planned',
      }),
    ]);
    expect(document.html).toContain('Лист сборки WAVE-1');
    expect(document.html).toContain('BOX-A1 / PAL-01');
  });

  it('показывает фактические аллокации после запуска волны', async () => {
    const prisma = {
      pickWave: {
        findUnique: vi.fn().mockResolvedValue(
          waveFixture({
            status: PickWaveStatus.DONE,
            linkStatus: PickWaveRequestStatus.PICKED,
            result: {
              status: 'APPLIED',
              pickedLines: [
                {
                  itemId: 'item-1',
                  skuId: 'sku-1',
                  requestedQuantity: 3,
                  pickedQuantity: 3,
                  allocations: [{ boxId: 'box-picked', palletId: 'pallet-picked', quantity: 3 }],
                },
              ],
            },
          }),
        ),
      },
      stockBalance: {
        findMany: vi.fn(),
      },
      box: {
        findMany: vi.fn().mockResolvedValue([{ id: 'box-picked', code: 'BOX-DONE' }]),
      },
      pallet: {
        findMany: vi.fn().mockResolvedValue([{ id: 'pallet-picked', code: 'PAL-DONE' }]),
      },
    };
    const service = new PickWaveDocumentService(prisma as never, { requireClientAccess: vi.fn() } as never);

    const document = await service.getWaveDocument('wave-1', user());

    expect(prisma.stockBalance.findMany).not.toHaveBeenCalled();
    expect(document.totalPicked).toBe(3);
    expect(document.rows[0].allocations).toEqual([
      expect.objectContaining({
        boxCode: 'BOX-DONE',
        palletCode: 'PAL-DONE',
        source: 'picked',
      }),
    ]);
    expect(document.html).toContain('BOX-DONE / PAL-DONE');
  });

  it('возвращает 404 для неизвестной волны', async () => {
    const service = new PickWaveDocumentService(
      { pickWave: { findUnique: vi.fn().mockResolvedValue(null) } } as never,
      { requireClientAccess: vi.fn() } as never,
    );

    await expect(service.getWaveDocument('missing', user())).rejects.toThrow(NotFoundException);
  });
});

function waveFixture(overrides: { status?: PickWaveStatus; linkStatus?: PickWaveRequestStatus; result?: unknown } = {}) {
  return {
    id: 'wave-1',
    waveNumber: 'WAVE-1',
    status: overrides.status ?? PickWaveStatus.PLANNED,
    comment: 'Первая волна',
    createdAt: new Date('2026-06-26T09:00:00.000Z'),
    updatedAt: new Date('2026-06-26T09:10:00.000Z'),
    createdBy: {
      id: 'user-1',
      email: 'operator@example.com',
      name: 'Operator',
    },
    requests: [
      {
        waveId: 'wave-1',
        requestId: 'request-1',
        status: overrides.linkStatus ?? PickWaveRequestStatus.PLANNED,
        result: overrides.result ?? null,
        pickedAt: null,
        request: {
          id: 'request-1',
          clientId: 'client-1',
          title: 'Отгрузка',
          status: ClientRequestStatus.APPROVED,
          client: {
            code: 'CLIENT',
            name: 'Клиент',
          },
          items: [
            {
              id: 'item-1',
              requestId: 'request-1',
              skuId: 'sku-1',
              barcode: '4600000000000',
              name: 'Товар',
              quantity: 3,
              comment: null,
              sku: {
                id: 'sku-1',
                internalSku: 'SKU-1',
                name: 'Товар SKU',
              },
            },
          ],
        },
      },
    ],
  };
}

function user(): AuthUser {
  return {
    id: 'user-1',
    email: 'operator@example.com',
    name: 'Operator',
    roleCodes: ['OPERATOR'],
    permissionCodes: ['stock:write'],
    clientScopeMode: 'ALL',
    clientIds: [],
    writableClientIds: [],
  };
}
