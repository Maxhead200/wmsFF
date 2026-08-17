import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { PrinterScopeService } from '../src/modules/auth/printer-scope.service';

describe('PrinterScopeService', () => {
  const service = new PrinterScopeService();

  it('не ограничивает system:admin', () => {
    expect(service.resolvePrinterGroupFilter(user({ permissionCodes: ['system:admin'] }))).toBeUndefined();
    expect(service.resolvePrinterGroupFilter(user({ permissionCodes: ['system:admin'] }), 'zone-a')).toBe('ZONE-A');
  });

  it('сужает печать по доступным группам', () => {
    expect(
      service.resolvePrinterGroupFilter(
        user({ printerGroups: [{ groupCode: 'zone-a', canPrint: true, canManage: false }] }),
      ),
    ).toEqual({ in: ['ZONE-A'] });
  });

  it('разделяет право печати и управления группой', () => {
    const scopedUser = user({ printerGroups: [{ groupCode: 'zone-a', canPrint: true, canManage: false }] });

    expect(() => service.requirePrinterGroupAccess(scopedUser, 'ZONE-A', 'print')).not.toThrow();
    expect(() => service.requirePrinterGroupAccess(scopedUser, 'ZONE-A', 'manage')).toThrow(ForbiddenException);
  });
});

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleCodes: ['OPERATOR'],
    permissionCodes: ['print:write'],
    clientScopeMode: 'ALL',
    clientIds: [],
    writableClientIds: [],
    printerGroups: [],
    ...overrides,
  };
}
