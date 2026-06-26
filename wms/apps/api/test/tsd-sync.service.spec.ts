import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { TsdSyncService } from '../src/modules/tsd/tsd-sync.service';

describe('TsdSyncService', () => {
  const user: AuthUser = {
    id: 'user-1',
    email: 'operator@example.com',
    name: 'Operator',
    roleCodes: ['OPERATOR'],
    permissionCodes: ['stock:write'],
    clientScopeMode: 'ALL',
    clientIds: [],
    writableClientIds: [],
  };

  it('принимает receipt_scan как queued операцию', async () => {
    const service = new TsdSyncService({ transferBetweenBoxes: vi.fn() } as never);

    await expect(
      service.acceptOperation(
        {
          deviceId: 'tsd-1',
          operationKey: 'receipt-1',
          operationType: 'receipt_scan',
          payload: { barcode: '4600001' },
        },
        user,
      ),
    ).resolves.toMatchObject({
      operationKey: 'receipt-1',
      operationType: 'receipt_scan',
      status: 'ACCEPTED',
    });
  });

  it('применяет move_scan через stock transfer', async () => {
    const transferBetweenBoxes = vi.fn().mockResolvedValue({ status: 'APPLIED' });
    const service = new TsdSyncService({ transferBetweenBoxes } as never);

    const [result] = await service.syncOperations(
      {
        operations: [
          {
            deviceId: 'tsd-1',
            operationKey: 'move-1',
            operationType: 'move_scan',
            payload: {
              clientId: 'client-1',
              barcode: '4600001',
              fromBoxCode: 'BOX-1',
              toBoxCode: 'BOX-2',
              quantity: '3',
            },
          },
        ],
      },
      user,
    );

    expect(result.status).toBe('APPLIED');
    expect(transferBetweenBoxes).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        barcode: '4600001',
        fromBoxCode: 'BOX-1',
        toBoxCode: 'BOX-2',
        quantity: 3,
        idempotencyKey: 'move-1',
      }),
      user,
    );
  });

  it('возвращает REJECTED для некорректного move_scan и продолжает batch', async () => {
    const service = new TsdSyncService({ transferBetweenBoxes: vi.fn() } as never);

    const results = await service.syncOperations(
      {
        operations: [
          {
            deviceId: 'tsd-1',
            operationKey: 'bad-move',
            operationType: 'move_scan',
            payload: { clientId: 'client-1' },
          },
          {
            deviceId: 'tsd-1',
            operationKey: 'inventory-1',
            operationType: 'inventory_scan',
            payload: { barcode: '4600002' },
          },
        ],
      },
      user,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ operationKey: 'bad-move', status: 'REJECTED' });
    expect(results[1]).toMatchObject({ operationKey: 'inventory-1', status: 'ACCEPTED' });
  });
});
