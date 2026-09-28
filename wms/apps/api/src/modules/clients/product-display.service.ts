import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClientScopeService } from '../auth/client-scope.service';
import type { AuthUser } from '../auth/auth.types';
import { validProductDisplayFields } from './product-display.policy';

@Injectable()
export class ProductDisplayService {
  constructor(private readonly prisma: PrismaService, private readonly scopes: ClientScopeService) {}

  private async check(clientId: string, user: AuthUser, mode: 'read' | 'write') {
    if (process.env.WMS_CLIENT_PRODUCT_DISPLAY_ENABLED !== 'true') {
      throw new NotFoundException('Настройка отображения товаров не включена.');
    }
    this.scopes.requireClientAccess(user, clientId, mode);
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, isDemo: Boolean(user.isDemo) }, select: { id: true },
    });
    if (!client) throw new NotFoundException('Клиент не найден.');
  }

  async get(clientId: string, user: AuthUser) {
    await this.check(clientId, user, 'read');
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: this.key(clientId) } });
    // FIX: null keeps the existing screen defaults; no mass rewrite of client preferences.
    return { clientId, fields: validProductDisplayFields(setting?.value) ? setting.value : null };
  }

  async save(clientId: string, fields: unknown, user: AuthUser) {
    await this.check(clientId, user, 'write');
    if (fields !== null && !validProductDisplayFields(fields)) {
      throw new BadRequestException('Выберите от одного до пяти разных полей товара.');
    }
    const key = this.key(clientId);
    // FIX: keep the author/time when restoring defaults as well as saving a custom selection.
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: fields ?? { defaults: true }, updatedByUserId: user.id },
      update: { value: fields ?? { defaults: true }, updatedByUserId: user.id },
    });
    return { clientId, fields };
  }

  private key(clientId: string) { return `client.product-display.v1:${clientId}`; }
}
