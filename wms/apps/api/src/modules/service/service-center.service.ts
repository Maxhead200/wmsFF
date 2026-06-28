import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingUnit } from '@prisma/client';
import { isIP } from 'net';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { TelegramNotificationsService } from '../../common/telegram/telegram-notifications.service';
import type { AuthUser } from '../auth/auth.types';

const CLEANUP_CONFIRMATION = 'ОЧИСТИТЬ';

const MAINTENANCE_KEY = 'SYSTEM_MAINTENANCE';

@Injectable()
export class ServiceCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly telegram: TelegramNotificationsService,
  ) {}

  async getOverview() {
    const onlineSince = new Date(Date.now() - 1000 * 60 * 15);
    const [clients, users, onlineUsers, nomenclature, skus, services, invoices, stock, maintenance] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.user.count(),
      this.prisma.userSession.count({
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
          lastSeenAt: { gte: onlineSince },
        },
      }),
      this.prisma.nomenclatureItem.count(),
      this.prisma.sku.count(),
      this.prisma.billingService.count(),
      this.prisma.billingInvoice.count(),
      this.prisma.stockBalance.aggregate({
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      this.getMaintenanceMode(),
    ]);

    return {
      maintenance,
      counters: {
        clients,
        users,
        onlineUsers,
        nomenclature,
        skus,
        services,
        invoices,
        stockRows: stock._count._all,
        stockQuantity: stock._sum.quantity ?? 0,
      },
    };
  }

  listOnlineSessions() {
    const onlineSince = new Date(Date.now() - 1000 * 60 * 15);
    return this.prisma.userSession.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
        lastSeenAt: { gte: onlineSince },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            roles: {
              include: {
                role: {
                  select: {
                    code: true,
                    name: true,
                  },
                },
              },
            },
            clientScopes: {
              include: {
                client: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
    });
  }

  listClientIpRules(clientId?: string) {
    return this.prisma.clientAllowedIp.findMany({
      where: clientId ? { clientId } : {},
      include: {
        client: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ client: { name: 'asc' } }, { ipAddress: 'asc' }],
    });
  }

  async createClientIpRule(clientId: string, dto: { ipAddress?: string; comment?: string }, user: AuthUser) {
    await this.findClient(clientId);
    const ipAddress = normalizeIp(dto.ipAddress);
    if (!ipAddress || isIP(ipAddress) === 0) {
      throw new BadRequestException('Укажите корректный IP-адрес.');
    }

    try {
      const rule = await this.prisma.clientAllowedIp.create({
        data: {
          clientId,
          ipAddress,
          comment: dto.comment?.trim() || null,
          createdByUserId: user.id,
        },
        include: {
          client: { select: { id: true, code: true, name: true } },
        },
      });
      await this.auditLog.write({
        userId: user.id,
        action: 'service.client-ip.create',
        entity: 'client-allowed-ip',
        entityId: rule.id,
        payload: { clientId, ipAddress },
      });
      return rule;
    } catch (caught) {
      if (isUniqueConstraintError(caught)) {
        throw new BadRequestException('Такой IP уже разрешен для выбранного клиента.');
      }
      throw caught;
    }
  }

  async deleteClientIpRule(id: string, user: AuthUser) {
    const rule = await this.prisma.clientAllowedIp.findUnique({
      where: { id },
      include: { client: { select: { id: true, code: true, name: true } } },
    });
    if (!rule) {
      throw new NotFoundException('IP-правило не найдено.');
    }

    await this.prisma.clientAllowedIp.delete({ where: { id } });
    await this.auditLog.write({
      userId: user.id,
      action: 'service.client-ip.delete',
      entity: 'client-allowed-ip',
      entityId: id,
      payload: { clientId: rule.clientId, ipAddress: rule.ipAddress },
    });

    return { id, ipAddress: rule.ipAddress, client: rule.client, deleted: true };
  }

  async getMaintenanceMode() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: MAINTENANCE_KEY },
    });
    const value = setting?.value;
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

    return {
      enabled: payload.enabled === true,
      message: typeof payload.message === 'string' ? payload.message : 'В WMS идут сервисные работы. Вход временно закрыт.',
      updatedAt: setting?.updatedAt ?? null,
      updatedByUserId: setting?.updatedByUserId ?? null,
    };
  }

  async updateMaintenanceMode(dto: { enabled?: boolean; message?: string }, user: AuthUser) {
    const enabled = dto.enabled === true;
    const message = dto.message?.trim() || 'В WMS идут сервисные работы. Вход временно закрыт.';

    const setting = await this.prisma.systemSetting.upsert({
      where: { key: MAINTENANCE_KEY },
      update: {
        value: { enabled, message },
        updatedByUserId: user.id,
      },
      create: {
        key: MAINTENANCE_KEY,
        value: { enabled, message },
        updatedByUserId: user.id,
      },
    });

    await this.auditLog.write({
      userId: user.id,
      action: enabled ? 'service.maintenance.enable' : 'service.maintenance.disable',
      entity: 'system-setting',
      entityId: MAINTENANCE_KEY,
      payload: { enabled, message },
    });

    return {
      enabled,
      message,
      updatedAt: setting.updatedAt,
      updatedByUserId: setting.updatedByUserId,
    };
  }

  getTelegramSettings() {
    return this.telegram.getPublicSettings();
  }

  async updateTelegramSettings(dto: { enabled?: boolean; botToken?: string; fulfillmentChatIds?: string }, user: AuthUser) {
    const settings = await this.telegram.updateSettings(dto, user.id);
    await this.auditLog.write({
      userId: user.id,
      action: 'service.telegram.update',
      entity: 'system-setting',
      entityId: 'TELEGRAM_NOTIFICATIONS',
      payload: {
        enabled: settings.enabled,
        hasBotToken: settings.hasBotToken,
        fulfillmentChatIds: settings.fulfillmentChatIds,
      },
    });
    return settings;
  }

  async sendTelegramTest(dto: { chatId?: string; message?: string }) {
    const chatId = dto.chatId?.trim();
    if (!chatId) {
      throw new BadRequestException('Укажите Telegram chat_id для теста.');
    }
    return this.telegram.sendTestMessage(chatId, dto.message?.trim() || 'Тестовое уведомление WMS LOGOFF.');
  }

  async getClientStockCleanupPreview(clientId: string) {
    const client = await this.findClient(clientId);
    const summary = await this.getClientStockSummary(clientId);

    return {
      client,
      summary,
      confirmationText: CLEANUP_CONFIRMATION,
      warning:
        'Будут удалены остатки, движения склада, КИЗы, короба и паллеты выбранного клиента. Клиент, пользователи, SKU, каталог и API маркетплейсов останутся.',
    };
  }

  async purgeClientStock(clientId: string, confirmation: string | undefined, user: AuthUser) {
    if (confirmation !== CLEANUP_CONFIRMATION) {
      throw new BadRequestException(`Для очистки введите подтверждение: ${CLEANUP_CONFIRMATION}.`);
    }

    const client = await this.findClient(clientId);
    const before = await this.getClientStockSummary(clientId);

    const deleted = await this.prisma.$transaction(async (tx) => {
      const productMarks = await tx.productMark.deleteMany({ where: { clientId } });
      const balances = await tx.stockBalance.deleteMany({ where: { clientId } });
      const movements = await tx.stockMovement.deleteMany({ where: { clientId } });
      const boxes = await tx.box.deleteMany({ where: { clientId } });
      const pallets = await tx.pallet.deleteMany({ where: { clientId } });

      return {
        productMarks: productMarks.count,
        balances: balances.count,
        movements: movements.count,
        boxes: boxes.count,
        pallets: pallets.count,
      };
    });

    await this.auditLog.write({
      userId: user.id,
      action: 'service.client-stock.purge',
      entity: 'client',
      entityId: clientId,
      payload: {
        clientCode: client.code,
        clientName: client.name,
        before,
        deleted,
      },
    });

    return {
      client,
      before,
      deleted,
      after: await this.getClientStockSummary(clientId),
    };
  }

  async listNomenclature(filter: { search?: string }) {
    const search = filter.search?.trim();
    return this.prisma.nomenclatureItem.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { printName: { contains: search, mode: 'insensitive' } },
              { internalSku: { contains: search, mode: 'insensitive' } },
              { article: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search } },
            ],
          }
        : {},
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async deleteNomenclatureItem(id: string, user: AuthUser) {
    const item = await this.prisma.nomenclatureItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Номенклатура не найдена.');
    }

    await this.prisma.nomenclatureItem.delete({ where: { id } });
    await this.auditLog.write({
      userId: user.id,
      action: 'service.nomenclature.delete',
      entity: 'nomenclature-item',
      entityId: id,
      payload: { internalSku: item.internalSku, name: item.name, barcode: item.barcode },
    });

    return { id, internalSku: item.internalSku, name: item.name, deleted: true };
  }

  listBillingServices() {
    return this.prisma.billingService.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            charges: true,
            clientPrices: true,
          },
        },
      },
    });
  }

  async createBillingService(
    dto: {
      code: string;
      name: string;
      unit?: BillingUnit;
      defaultPriceRub?: number;
      isActive?: boolean;
    },
    user: AuthUser,
  ) {
    try {
      const service = await this.prisma.billingService.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          unit: dto.unit ?? BillingUnit.SERVICE,
          defaultPriceRub: dto.defaultPriceRub,
          isActive: dto.isActive ?? true,
        },
      });
      await this.auditLog.write({
        userId: user.id,
        action: 'service.billing-service.create',
        entity: 'billing-service',
        entityId: service.id,
        payload: { code: service.code, name: service.name },
      });
      return service;
    } catch (caught) {
      if (isUniqueConstraintError(caught)) {
        throw new BadRequestException('Услуга с таким кодом уже есть.');
      }
      throw caught;
    }
  }

  async updateBillingServiceStatus(id: string, isActive: boolean, user: AuthUser) {
    const service = await this.prisma.billingService.update({
      where: { id },
      data: { isActive },
    });

    await this.auditLog.write({
      userId: user.id,
      action: isActive ? 'service.billing-service.activate' : 'service.billing-service.deactivate',
      entity: 'billing-service',
      entityId: id,
      payload: { code: service.code, name: service.name, isActive },
    });

    return service;
  }

  async deleteBillingService(id: string, user: AuthUser) {
    const service = await this.prisma.billingService.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            charges: true,
            clientPrices: true,
          },
        },
      },
    });
    if (!service) {
      throw new NotFoundException('Услуга не найдена.');
    }
    if (service._count.charges + service._count.clientPrices > 0) {
      throw new BadRequestException('Услугу нельзя удалить: она уже используется в начислениях или ценах клиентов. Отключите ее.');
    }

    await this.prisma.billingService.delete({ where: { id } });
    await this.auditLog.write({
      userId: user.id,
      action: 'service.billing-service.delete',
      entity: 'billing-service',
      entityId: id,
      payload: { code: service.code, name: service.name },
    });

    return { id, code: service.code, name: service.name, deleted: true };
  }

  private async findClient(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });

    if (!client) {
      throw new NotFoundException('Клиент не найден.');
    }

    return client;
  }

  private async getClientStockSummary(clientId: string) {
    const [balances, movements, boxes, pallets, productMarks, skuRows] = await Promise.all([
      this.prisma.stockBalance.aggregate({
        where: { clientId },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.count({ where: { clientId } }),
      this.prisma.box.count({ where: { clientId } }),
      this.prisma.pallet.count({ where: { clientId } }),
      this.prisma.productMark.count({ where: { clientId } }),
      this.prisma.stockBalance.groupBy({
        by: ['skuId'],
        where: { clientId },
      }),
    ]);

    return {
      balanceRows: balances._count._all,
      quantity: balances._sum.quantity ?? 0,
      uniqueSkusInStock: skuRows.length,
      movements,
      boxes,
      pallets,
      productMarks,
    };
  }
}

function isUniqueConstraintError(caught: unknown) {
  return (
    typeof caught === 'object' &&
    caught !== null &&
    'code' in caught &&
    (caught as { code?: string }).code === 'P2002'
  );
}

function normalizeIp(ipAddress?: string) {
  return ipAddress?.trim().replace(/^::ffff:/, '') ?? '';
}
