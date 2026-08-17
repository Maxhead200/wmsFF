import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { PermissionsGuard } from '../src/modules/auth/guards/permissions.guard';

describe('PermissionsGuard', () => {
  it('пропускает запрос без требований к правам', () => {
    const guard = guardWithRequired(undefined);

    expect(guard.canActivate(contextWithUser({ permissionCodes: [] }))).toBe(true);
  });

  it('пропускает администратора с system:admin', () => {
    const guard = guardWithRequired(['clients:write']);

    expect(guard.canActivate(contextWithUser({ permissionCodes: ['system:admin'] }))).toBe(true);
  });

  it('запрещает запрос без нужного права', () => {
    const guard = guardWithRequired(['stock:write']);

    expect(() => guard.canActivate(contextWithUser({ permissionCodes: ['stock:read'] }))).toThrow(ForbiddenException);
  });
});

function guardWithRequired(required: string[] | undefined) {
  return new PermissionsGuard({
    getAllAndOverride: () => required,
  } as never);
}

function contextWithUser(user: Pick<AuthUser, 'permissionCodes'>) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}
