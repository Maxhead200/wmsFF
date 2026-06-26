import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from './auth.types';

type PrinterGroupFilter = string | { in: string[] } | undefined;

@Injectable()
export class PrinterScopeService {
  resolvePrinterGroupFilter(
    user: AuthUser,
    requestedGroupCode?: string,
    mode: 'print' | 'manage' = 'print',
  ): PrinterGroupFilter {
    const groupCode = requestedGroupCode ? normalizePrinterGroupCode(requestedGroupCode) : undefined;
    if (groupCode) {
      this.requirePrinterGroupAccess(user, groupCode, mode);
      return groupCode;
    }

    if (this.hasGlobalPrinterAccess(user)) {
      return undefined;
    }

    return { in: this.allowedGroups(user, mode) };
  }

  requirePrinterGroupAccess(user: AuthUser, groupCode: string, mode: 'print' | 'manage') {
    if (this.hasGlobalPrinterAccess(user)) {
      return;
    }

    const normalizedGroupCode = normalizePrinterGroupCode(groupCode);
    if (!this.allowedGroups(user, mode).includes(normalizedGroupCode)) {
      throw new ForbiddenException({
        message: 'Нет доступа к группе принтеров.',
        groupCode: normalizedGroupCode,
        mode,
      });
    }
  }

  hasGlobalPrinterAccess(user: AuthUser) {
    return user.permissionCodes.includes('system:admin');
  }

  allowedGroups(user: AuthUser, mode: 'print' | 'manage') {
    return (user.printerGroups ?? [])
      .filter((scope) => (mode === 'manage' ? scope.canManage : scope.canPrint))
      .map((scope) => normalizePrinterGroupCode(scope.groupCode));
  }
}

export function normalizePrinterGroupCode(value: string) {
  return value.trim().toUpperCase();
}
