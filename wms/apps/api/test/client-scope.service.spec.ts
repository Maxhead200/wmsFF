import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { ClientScopeService } from '../src/modules/auth/client-scope.service';

describe('ClientScopeService', () => {
  const service = new ClientScopeService();

  it('возвращает пустой фильтр для глобального доступа', () => {
    expect(service.resolveClientFilter(user({ clientScopeMode: 'ALL' }))).toBeUndefined();
  });

  it('ограничивает список клиентов для LIMITED пользователя', () => {
    expect(service.resolveClientFilter(user({ clientIds: ['client-1', 'client-2'] }))).toEqual({
      in: ['client-1', 'client-2'],
    });
  });

  it('запрещает чтение чужого клиента', () => {
    expect(() => service.resolveClientFilter(user({ clientIds: ['client-1'] }), 'client-2')).toThrow(
      ForbiddenException,
    );
  });

  it('требует отдельный write scope для операций изменения', () => {
    expect(() => service.requireClientAccess(user({ clientIds: ['client-1'] }), 'client-1', 'write')).toThrow(
      ForbiddenException,
    );

    expect(() =>
      service.requireClientAccess(
        user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
        'client-1',
        'write',
      ),
    ).not.toThrow();
  });
});

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleCodes: ['CLIENT'],
    permissionCodes: [],
    clientScopeMode: 'LIMITED',
    clientIds: [],
    writableClientIds: [],
    ...overrides,
  };
}
