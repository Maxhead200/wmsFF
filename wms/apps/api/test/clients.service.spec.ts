import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { ClientsService } from '../src/modules/clients/clients.service';

describe('ClientsService', () => {
  it('обновляет реквизиты клиента и очищает пустые поля', async () => {
    const prisma = {
      client: {
        update: vi.fn().mockResolvedValue({ id: 'client-1', code: 'CLIENT', name: 'ООО Клиент' }),
      },
    };
    const scopes = {
      requireGlobalClientAccess: vi.fn(),
    };
    const service = new ClientsService(prisma as never, scopes as never);

    await service.update(
      'client-1',
      {
        name: ' ООО Клиент ',
        legalName: ' ООО "Клиент" ',
        email: '',
        bankAccount: ' 40702810000000000001 ',
      },
      user(),
    );

    expect(scopes.requireGlobalClientAccess).toHaveBeenCalledWith(expect.any(Object));
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: {
        name: 'ООО Клиент',
        legalName: 'ООО "Клиент"',
        email: null,
        bankAccount: '40702810000000000001',
      },
    });
  });
});

function user(): AuthUser {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin',
    roleCodes: ['ADMIN'],
    permissionCodes: ['clients:write'],
    clientScopeMode: 'ALL',
    clientIds: [],
    writableClientIds: [],
  };
}
