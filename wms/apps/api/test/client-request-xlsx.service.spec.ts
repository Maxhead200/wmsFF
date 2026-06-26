import * as XLSX from 'xlsx';
import { ClientRequestPriority } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { ClientScopeService } from '../src/modules/auth/client-scope.service';
import { ClientRequestXlsxService } from '../src/modules/client-requests/client-request-xlsx.service';

describe('ClientRequestXlsxService', () => {
  it('показывает доступность SKU и дефицит по Excel-файлу', async () => {
    const prisma = {
      barcode: {
        findMany: vi.fn().mockResolvedValue([
          {
            skuId: 'sku-1',
            value: '460000000001',
            sku: { id: 'sku-1', internalSku: 'BAR-001', name: 'Товар 1' },
          },
          {
            skuId: 'sku-2',
            value: '460000000002',
            sku: { id: 'sku-2', internalSku: 'BAR-002', name: 'Товар 2' },
          },
        ]),
      },
      stockBalance: {
        groupBy: vi.fn().mockResolvedValue([
          { skuId: 'sku-1', _sum: { quantity: 5 } },
          { skuId: 'sku-2', _sum: { quantity: 1 } },
        ]),
      },
    };
    const service = new ClientRequestXlsxService(prisma as never, new ClientScopeService(), { create: vi.fn() } as never);

    const preview = await service.previewOutboundRequest(
      fileFixture([
        ['barcode', 'qty'],
        ['460000000001', 4],
        ['460000000002', 2],
      ]),
      { clientId: 'client-1', title: 'Excel сборка' },
      user({ writableClientIds: ['client-1'], clientIds: ['client-1'] }),
    );

    expect(preview.canCommit).toBe(false);
    expect(preview.summary).toMatchObject({ lines: 2, totalQuantity: 6, availableQuantity: 5, shortageQuantity: 1 });
    expect(preview.lines[0]).toMatchObject({ skuId: 'sku-1', requestedQuantity: 4, availableQuantity: 5, canFulfill: true });
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ barcode: '460000000002', severity: 'error', message: expect.stringContaining('Недостаточно') }),
    );
  });

  it('создает outbound-заявку из валидного Excel-файла', async () => {
    const clientRequests = {
      create: vi.fn().mockResolvedValue({ id: 'request-1', title: 'Excel сборка' }),
    };
    const prisma = {
      barcode: {
        findMany: vi.fn().mockResolvedValue([
          {
            skuId: 'sku-1',
            value: '460000000001',
            sku: { id: 'sku-1', internalSku: 'BAR-001', name: 'Товар 1' },
          },
        ]),
      },
      stockBalance: {
        groupBy: vi.fn().mockResolvedValue([{ skuId: 'sku-1', _sum: { quantity: 7 } }]),
      },
    };
    const service = new ClientRequestXlsxService(prisma as never, new ClientScopeService(), clientRequests as never);
    const authUser = user({ writableClientIds: ['client-1'], clientIds: ['client-1'] });

    const result = await service.createOutboundRequest(
      fileFixture([['barcode', 'qty'], ['460000000001', 3]], 'order.xlsx'),
      { clientId: 'client-1', title: 'Excel сборка', priority: ClientRequestPriority.HIGH },
      authUser,
    );

    expect(result.request).toEqual({ id: 'request-1', title: 'Excel сборка' });
    expect(clientRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        type: 'OUTBOUND',
        priority: ClientRequestPriority.HIGH,
        title: 'Excel сборка',
        items: [
          expect.objectContaining({
            skuId: 'sku-1',
            barcode: '460000000001',
            name: 'Товар 1',
            quantity: 3,
          }),
        ],
      }),
      authUser,
    );
  });
});

function fileFixture(rows: unknown[][], originalname = 'request.xlsx'): Express.Multer.File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
    stream: undefined as never,
    destination: '',
    filename: originalname,
    path: '',
  };
}

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleCodes: ['CLIENT'],
    permissionCodes: ['client-requests:read', 'client-requests:write'],
    clientScopeMode: 'LIMITED',
    clientIds: [],
    writableClientIds: [],
    ...overrides,
  };
}
