import { TsdDeviceStatus, UserStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { TsdDeviceService } from '../src/modules/tsd/tsd-device.service';

describe('TsdDeviceService', () => {
  it('создает ТСД с одноразовым секретом и hash в базе', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(operatorUser()),
      },
      tsdDevice: {
        create: vi.fn().mockResolvedValue({
          id: 'device-1',
          code: 'TSD-01',
          name: 'Терминал 01',
          status: TsdDeviceStatus.ACTIVE,
          userId: 'user-1',
          createdAt: new Date('2026-06-26T00:00:00Z'),
        }),
      },
    };
    const service = new TsdDeviceService(
      prisma as never,
      { hash: vi.fn().mockResolvedValue('secret-hash') } as never,
      { sign: vi.fn() } as never,
    );

    const result = await service.createDevice({ code: ' tsd-01 ', name: 'Терминал 01', userId: 'user-1' });

    expect(result).toMatchObject({ id: 'device-1', code: 'TSD-01', deviceSecret: expect.any(String) });
    expect(prisma.tsdDevice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'TSD-01',
          secretHash: 'secret-hash',
        }),
      }),
    );
  });

  it('логинит активный ТСД и подписывает token с device claims', async () => {
    const prisma = {
      tsdDevice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'device-1',
          code: 'TSD-01',
          name: 'Терминал 01',
          secretHash: 'secret-hash',
          status: TsdDeviceStatus.ACTIVE,
          userId: 'user-1',
          user: operatorUser(),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const sign = vi.fn().mockReturnValue('signed-token');
    const service = new TsdDeviceService(
      prisma as never,
      { verify: vi.fn().mockResolvedValue(true) } as never,
      { sign } as never,
    );

    const result = await service.login({ code: 'tsd-01', secret: 'device-secret' });

    expect(sign).toHaveBeenCalledWith('user-1', { deviceId: 'device-1', deviceCode: 'TSD-01' });
    expect(result).toMatchObject({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      device: { id: 'device-1', code: 'TSD-01' },
    });
  });
});

function operatorUser() {
  return {
    id: 'user-1',
    email: 'operator@example.com',
    name: 'Operator',
    status: UserStatus.ACTIVE,
    clientScopes: [],
    roles: [
      {
        role: {
          code: 'OPERATOR',
          permissions: [
            {
              permission: {
                code: 'stock:write',
              },
            },
          ],
        },
      },
    ],
  };
}
