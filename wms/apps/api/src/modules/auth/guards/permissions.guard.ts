import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../auth.types';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const permissions = new Set(request.user?.permissionCodes ?? []);

    if (permissions.has('system:admin') || required.every((permission) => permissions.has(permission))) {
      return true;
    }

    // Русский комментарий: guard возвращает список недостающих прав, чтобы администратор быстро понял, какой доступ выдать роли.
    throw new ForbiddenException({
      message: 'Недостаточно прав для операции.',
      required,
      missing: required.filter((permission) => !permissions.has(permission)),
    });
  }
}
