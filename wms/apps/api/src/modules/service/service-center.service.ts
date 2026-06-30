import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingInvoiceStatus,
  BillingUnit,
  ClientKind,
  ClientNotificationSeverity,
  ClientRequestEventType,
  ClientRequestStatus,
  ClientRequestType,
  ClientStatus,
  MovementType,
  StockStatus,
  UserStatus,
  VolumeSource,
} from '@prisma/client';
import { isIP } from 'net';
import { DEMO_CLIENT_CODE, DEMO_CLIENT_NAME, DEMO_MODE_SETTING_KEY, DEMO_USER_LOGIN, DEMO_USER_PASSWORD } from '../../common/demo/demo-mode';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { TelegramNotificationsService } from '../../common/telegram/telegram-notifications.service';
import type { AuthUser } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';

const CLEANUP_CONFIRMATION = 'ОЧИСТИТЬ';
const REQUEST_CLEANUP_CONFIRMATION = 'УДАЛИТЬ ЗАЯВКИ';

const MAINTENANCE_KEY = 'SYSTEM_MAINTENANCE';
const DEMO_INVOICE_NUMBER = 'DEMO-0001';

@Injectable()
export class ServiceCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly telegram: TelegramNotificationsService,
    private readonly passwords: PasswordService,
  ) {}

  async getOverview() {
    const onlineSince = new Date(Date.now() - 1000 * 60 * 15);
    const demoClient = await this.prisma.client.findUnique({
      where: { code: DEMO_CLIENT_CODE },
      select: { id: true, isDemo: true },
    });
    const demoClientId = demoClient?.isDemo ? demoClient.id : undefined;
    const [clients, users, onlineUsers, nomenclature, skus, services, invoices, stock, maintenance] = await Promise.all([
      this.prisma.client.count({ where: { isDemo: false } }),
      this.prisma.user.count({ where: { isDemo: false } }),
      this.prisma.userSession.count({
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
          lastSeenAt: { gte: onlineSince },
          user: { isDemo: false },
        },
      }),
      this.prisma.nomenclatureItem.count(),
      this.prisma.sku.count({ where: { client: { isDemo: false } } }),
      this.prisma.billingService.count(),
      this.prisma.billingInvoice.count({ where: { client: { isDemo: false } } }),
      this.prisma.stockBalance.aggregate({
        where: demoClientId ? { clientId: { not: demoClientId } } : undefined,
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
        user: { isDemo: false },
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

  async listProductMarks(filter: { search?: string; clientId?: string }) {
    const search = filter.search?.trim();
    const marks = await this.prisma.productMark.findMany({
      where: {
        clientId: filter.clientId?.trim() || undefined,
        value: search ? { contains: search, mode: 'insensitive' } : undefined,
      },
      include: {
        client: { select: { id: true, code: true, name: true } },
        sku: {
          select: {
            id: true,
            internalSku: true,
            clientSku: true,
            article: true,
            name: true,
            color: true,
            size: true,
            barcodes: { select: { value: true, isPrimary: true } },
          },
        },
        box: { select: { id: true, code: true } },
        stockMovement: { select: { id: true, sourceDocument: true, comment: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: search ? 100 : 50,
    });

    const enriched = [];
    for (const mark of marks) {
      const [tsdOperation, outboundMovement] = await Promise.all([
        this.findTsdReceiptOperation(mark.value),
        this.findOutboundMovementForMark(mark),
      ]);
      enriched.push({
        id: mark.id,
        value: mark.value,
        status: mark.status,
        sourceDocument: mark.sourceDocument,
        acceptedAt: mark.createdAt,
        client: mark.client,
        sku: {
          ...mark.sku,
          barcode: mark.sku.barcodes.find((barcode) => barcode.isPrimary)?.value ?? mark.sku.barcodes[0]?.value ?? null,
        },
        box: mark.box,
        receiptMovement: mark.stockMovement,
        acceptedBy: tsdOperation?.user
          ? {
              id: tsdOperation.user.id,
              name: tsdOperation.user.name,
              email: tsdOperation.user.email,
            }
          : null,
        tsd: tsdOperation
          ? {
              deviceId: tsdOperation.deviceId,
              operationKey: tsdOperation.operationKey,
              createdAt: tsdOperation.createdAt,
            }
          : null,
        outbound: outboundMovement
          ? {
              movementId: outboundMovement.id,
              type: outboundMovement.type,
              sourceDocument: outboundMovement.sourceDocument,
              createdAt: outboundMovement.createdAt,
              request: outboundMovement.sourceDocument ? outboundMovement.request : null,
            }
          : null,
      });
    }

    return enriched;
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

  async getDemoMode() {
    const [setting, client, user] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: DEMO_MODE_SETTING_KEY } }),
      this.prisma.client.findUnique({
        where: { code: DEMO_CLIENT_CODE },
        select: { id: true, code: true, name: true, status: true, isDemo: true, createdAt: true },
      }),
      this.prisma.user.findUnique({
        where: { email: DEMO_USER_LOGIN },
        select: { id: true, email: true, name: true, status: true, isDemo: true, createdAt: true },
      }),
    ]);
    const enabled = this.isDemoSettingEnabled(setting?.value);
    const summary = client?.isDemo ? await this.getDemoSummary(client.id) : null;

    return {
      enabled,
      exists: Boolean(client?.isDemo && user?.isDemo),
      login: DEMO_USER_LOGIN,
      password: DEMO_USER_PASSWORD,
      client: client?.isDemo ? client : null,
      user: user?.isDemo ? user : null,
      summary,
      updatedAt: setting?.updatedAt ?? null,
      updatedByUserId: setting?.updatedByUserId ?? null,
    };
  }

  async enableDemoMode(user: AuthUser) {
    const client = await this.ensureDemoData();
    await this.prisma.user.updateMany({
      where: { email: DEMO_USER_LOGIN, isDemo: true },
      data: { status: UserStatus.ACTIVE },
    });
    await this.saveDemoSetting(true, user.id);
    await this.auditLog.write({
      userId: user.id,
      action: 'service.demo.enable',
      entity: 'client',
      entityId: client.id,
      payload: { code: DEMO_CLIENT_CODE },
    });
    return this.getDemoMode();
  }

  async disableDemoMode(user: AuthUser) {
    await Promise.all([
      this.prisma.user.updateMany({
        where: { email: DEMO_USER_LOGIN, isDemo: true },
        data: { status: UserStatus.BLOCKED },
      }),
      this.saveDemoSetting(false, user.id),
    ]);
    await this.auditLog.write({
      userId: user.id,
      action: 'service.demo.disable',
      entity: 'system-setting',
      entityId: DEMO_MODE_SETTING_KEY,
      payload: { code: DEMO_CLIENT_CODE },
    });
    return this.getDemoMode();
  }

  async recreateDemoMode(user: AuthUser) {
    await this.deleteDemoData();
    const client = await this.ensureDemoData();
    await this.saveDemoSetting(true, user.id);
    await this.auditLog.write({
      userId: user.id,
      action: 'service.demo.recreate',
      entity: 'client',
      entityId: client.id,
      payload: { code: DEMO_CLIENT_CODE },
    });
    return this.getDemoMode();
  }

  async deleteDemoMode(user: AuthUser) {
    const before = await this.getDemoMode();
    await this.deleteDemoData();
    await this.saveDemoSetting(false, user.id);
    await this.auditLog.write({
      userId: user.id,
      action: 'service.demo.delete',
      entity: 'system-setting',
      entityId: DEMO_MODE_SETTING_KEY,
      payload: { existed: before.exists, code: DEMO_CLIENT_CODE },
    });
    return this.getDemoMode();
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

  async getClientRequestCleanupPreview(clientId: string) {
    const client = await this.findClient(clientId);
    const summary = await this.getClientRequestsSummary(clientId);
    const recentRequests = await this.prisma.clientRequest.findMany({
      where: { clientId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        destinationCity: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            items: true,
            files: true,
            packages: true,
            comments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      client,
      summary,
      recentRequests,
      confirmationText: REQUEST_CLEANUP_CONFIRMATION,
      warning:
        'Будут удалены заявки выбранного клиента: строки, файлы, комментарии, история, упаковки и привязки к волнам сборки. Остатки, клиенты, пользователи, SKU, начисления и логистика останутся; у начислений и логистики будет снята ссылка на удаленные заявки.',
    };
  }

  async purgeClientRequests(clientId: string, confirmation: string | undefined, user: AuthUser) {
    if (confirmation !== REQUEST_CLEANUP_CONFIRMATION) {
      throw new BadRequestException(`Для удаления заявок введите подтверждение: ${REQUEST_CLEANUP_CONFIRMATION}.`);
    }

    const client = await this.findClient(clientId);
    const before = await this.getClientRequestsSummary(clientId);
    const requests = await this.prisma.clientRequest.findMany({
      where: { clientId },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        createdAt: true,
      },
    });
    const requestIds = requests.map((request) => request.id);

    if (requestIds.length === 0) {
      return {
        client,
        before,
        deleted: {
          requests: 0,
          notificationsUnlinked: 0,
          billingChargesUnlinked: 0,
          deliveryRequestsUnlinked: 0,
          systemSettings: 0,
        },
        after: before,
      };
    }

    const systemSettingKeys = requestIds.flatMap((requestId) => [
      `TSD_BOX_SEARCH:${requestId}`,
      `TSD_RELABEL:${requestId}`,
      `TSD_MOVES:${requestId}`,
      `TSD_REQUEST_WORKERS:${requestId}`,
    ]);

    const deleted = await this.prisma.$transaction(async (tx) => {
      const notifications = await tx.clientNotification.updateMany({
        where: { clientId, requestId: { in: requestIds } },
        data: { requestId: null },
      });
      const billingCharges = await tx.billingCharge.updateMany({
        where: { clientId, requestId: { in: requestIds } },
        data: { requestId: null },
      });
      const deliveryRequests = await tx.logisticsDeliveryRequest.updateMany({
        where: { clientId, requestId: { in: requestIds } },
        data: { requestId: null },
      });
      const systemSettings = await tx.systemSetting.deleteMany({
        where: { key: { in: systemSettingKeys } },
      });
      const requestsDeleted = await tx.clientRequest.deleteMany({
        where: { clientId, id: { in: requestIds } },
      });

      return {
        requests: requestsDeleted.count,
        notificationsUnlinked: notifications.count,
        billingChargesUnlinked: billingCharges.count,
        deliveryRequestsUnlinked: deliveryRequests.count,
        systemSettings: systemSettings.count,
      };
    });

    await this.auditLog.write({
      userId: user.id,
      action: 'service.client-requests.purge',
      entity: 'client',
      entityId: clientId,
      payload: {
        clientCode: client.code,
        clientName: client.name,
        before,
        deleted,
        requestIds,
      },
    });

    return {
      client,
      before,
      deleted,
      after: await this.getClientRequestsSummary(clientId),
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

  private async ensureDemoData() {
    const [client, user] = await Promise.all([
      this.prisma.client.findUnique({ where: { code: DEMO_CLIENT_CODE }, select: { id: true, isDemo: true } }),
      this.prisma.user.findUnique({ where: { email: DEMO_USER_LOGIN }, select: { id: true, isDemo: true } }),
    ]);

    if (client?.isDemo && user?.isDemo) {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.ACTIVE } });
      return this.prisma.client.findUniqueOrThrow({ where: { id: client.id }, select: { id: true, code: true, name: true } });
    }

    await this.deleteDemoData();
    return this.createDemoData();
  }

  private async createDemoData() {
    const passwordHash = await this.passwords.hash(DEMO_USER_PASSWORD);
    const clientRole = await this.prisma.role.findUniqueOrThrow({ where: { code: 'CLIENT' } });
    const today = new Date();
    const yesterday = new Date(today.getTime() - 1000 * 60 * 60 * 24);
    const weekAgo = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 7);

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          code: DEMO_CLIENT_CODE,
          name: DEMO_CLIENT_NAME,
          isDemo: true,
          clientKind: ClientKind.LEGAL_ENTITY,
          legalName: 'ООО "Демо компания LOGOff"',
          inn: '7700000000',
          legalAddress: 'г. Москва, демонстрационный контур',
          email: 'demo@logoff.pro',
          phone: '+7 999 000-00-00',
          storagePriceRubPerLiterDay: 0.06,
          status: ClientStatus.ACTIVE,
        },
        select: { id: true, code: true, name: true },
      });

      const demoUser = await tx.user.create({
        data: {
          email: DEMO_USER_LOGIN,
          name: 'Демо пользователь',
          passwordHash,
          status: UserStatus.ACTIVE,
          isDemo: true,
          roles: { create: [{ roleId: clientRole.id }] },
          clientScopes: { create: [{ clientId: client.id, canRead: true, canWrite: true }] },
        },
        select: { id: true },
      });

      const pallet = await tx.pallet.create({
        data: { clientId: client.id, code: 'DEMO-PLT-01', status: 'active' },
        select: { id: true },
      });
      const boxes = await Promise.all(
        ['DEMO-BOX-001', 'DEMO-BOX-002', 'DEMO-BOX-003', 'DEMO-BOX-004'].map((code) =>
          tx.box.create({
            data: { clientId: client.id, palletId: pallet.id, code, status: 'active' },
            select: { id: true, code: true },
          }),
        ),
      );

      const skuRows = await Promise.all(
        demoSkus.map((item) =>
          tx.sku.create({
            data: {
              clientId: client.id,
              internalSku: item.internalSku,
              clientSku: item.clientSku,
              article: item.article,
              name: item.name,
              brand: item.brand,
              category: item.category,
              color: item.color,
              size: item.size,
              lengthCm: item.lengthCm,
              widthCm: item.widthCm,
              heightCm: item.heightCm,
              volumeLiters: item.volumeLiters,
              volumeSource: VolumeSource.MANUAL,
              marketplace: 'WILDBERRIES',
              marketplaceOfferId: item.article,
              barcodes: { create: [{ value: item.barcode, isPrimary: true }] },
            },
            include: { barcodes: true },
          }),
        ),
      );
      const skuByBarcode = new Map(skuRows.flatMap((sku) => sku.barcodes.map((barcode) => [barcode.value, sku])));

      const balanceRows = [
        { barcode: '2049156013678', box: boxes[0], quantity: 40 },
        { barcode: '2049156013678', box: boxes[1], quantity: 35 },
        { barcode: '4607000011112', box: boxes[1], quantity: 120 },
        { barcode: '4607000011112', box: boxes[2], quantity: 140 },
        { barcode: '4607000011129', box: boxes[2], quantity: 80 },
        { barcode: '4607000011136', box: boxes[3], quantity: 42 },
      ];

      for (const row of balanceRows) {
        const sku = skuByBarcode.get(row.barcode);
        if (!sku) {
          continue;
        }
        await tx.stockBalance.create({
          data: {
            balanceKey: [client.id, sku.id, row.box.id, pallet.id, StockStatus.AVAILABLE].join(':'),
            clientId: client.id,
            skuId: sku.id,
            boxId: row.box.id,
            palletId: pallet.id,
            status: StockStatus.AVAILABLE,
            quantity: row.quantity,
          },
        });
        await tx.stockMovement.create({
          data: {
            clientId: client.id,
            skuId: sku.id,
            boxId: row.box.id,
            palletId: pallet.id,
            type: MovementType.RECEIPT,
            status: StockStatus.AVAILABLE,
            quantity: row.quantity,
            sourceDocument: 'Демо приемка',
            idempotencyKey: `demo-receipt:${row.barcode}:${row.box.code}`,
            comment: 'Демо-остаток для показа клиентского кабинета',
            createdAt: weekAgo,
          },
        });
      }

      const request = await tx.clientRequest.create({
        data: {
          clientId: client.id,
          type: ClientRequestType.OUTBOUND,
          status: ClientRequestStatus.IN_WORK,
          title: 'Демо сборка на маркетплейс',
          comment: 'Заявка показывает клиенту статусы, город доставки и состав отгрузки.',
          destinationCity: 'Казань',
          desiredDate: today,
          createdByUserId: demoUser.id,
          items: {
            create: [
              {
                skuId: skuByBarcode.get('2049156013678')?.id,
                barcode: '2049156013678',
                name: 'Костюм спортивный LOGOff демо',
                quantity: 25,
                comment: 'В работе у фулфилмента',
              },
              {
                skuId: skuByBarcode.get('4607000011112')?.id,
                barcode: '4607000011112',
                name: 'Футболка базовая LOGOff',
                quantity: 40,
              },
            ],
          },
        },
        select: { id: true },
      });

      await tx.clientRequestEvent.create({
        data: {
          requestId: request.id,
          clientId: client.id,
          eventType: ClientRequestEventType.CREATED,
          title: 'Демо-заявка создана',
          body: 'По этой заявке видно, как клиент отслеживает сборку.',
          createdByUserId: demoUser.id,
          createdAt: yesterday,
        },
      });
      await tx.clientNotification.create({
        data: {
          clientId: client.id,
          requestId: request.id,
          title: 'Заявка принята в работу',
          body: 'Сборка демо-поставки идет по плану. Город: Казань.',
          severity: ClientNotificationSeverity.SUCCESS,
          createdByUserId: demoUser.id,
          createdAt: yesterday,
        },
      });

      await tx.billingInvoice.create({
        data: {
          number: DEMO_INVOICE_NUMBER,
          clientId: client.id,
          periodFrom: weekAgo,
          periodTo: today,
          dueDate: new Date(today.getTime() + 1000 * 60 * 60 * 24 * 5),
          status: BillingInvoiceStatus.ISSUED,
          totalRub: 5480,
          paidRub: 0,
          issuedAt: today,
          comment: 'Демо-счет не участвует в реальном биллинге.',
          createdByUserId: demoUser.id,
          items: {
            create: [
              {
                description: 'Сборка коробов',
                unit: BillingUnit.BOX,
                quantity: 4,
                unitPriceRub: 40,
                totalRub: 160,
                serviceDate: today,
              },
              {
                description: 'Короб 60*40*40',
                unit: BillingUnit.BOX,
                quantity: 4,
                unitPriceRub: 100,
                totalRub: 400,
                serviceDate: today,
              },
              {
                description: 'Хранение за период',
                unit: BillingUnit.LITER_DAY,
                quantity: 820,
                unitPriceRub: 6,
                totalRub: 4920,
                serviceDate: today,
              },
            ],
          },
        },
      });

      return client;
    });
  }

  private async deleteDemoData() {
    const client = await this.prisma.client.findUnique({
      where: { code: DEMO_CLIENT_CODE },
      select: { id: true, isDemo: true },
    });
    const demoUsers = await this.prisma.user.findMany({
      where: { OR: [{ email: DEMO_USER_LOGIN }, { isDemo: true }] },
      select: { id: true, isDemo: true, email: true },
    });
    const userIds = demoUsers.filter((user) => user.isDemo || user.email === DEMO_USER_LOGIN).map((user) => user.id);

    if (!client?.isDemo && userIds.length === 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      if (client?.isDemo) {
        const requestIds = (await tx.clientRequest.findMany({ where: { clientId: client.id }, select: { id: true } })).map((request) => request.id);
        const invoiceIds = (await tx.billingInvoice.findMany({ where: { clientId: client.id }, select: { id: true } })).map((invoice) => invoice.id);
        const skuIds = (await tx.sku.findMany({ where: { clientId: client.id }, select: { id: true } })).map((sku) => sku.id);
        const settingKeys = requestIds.flatMap((requestId) => [
          `TSD_BOX_SEARCH:${requestId}`,
          `TSD_RELABEL:${requestId}`,
          `TSD_MOVES:${requestId}`,
          `TSD_REQUEST_WORKERS:${requestId}`,
        ]);

        await tx.systemSetting.deleteMany({ where: { key: { in: settingKeys } } });
        await tx.pickWaveRequest.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.clientRequestPackageItem.deleteMany({ where: { package: { clientId: client.id } } });
        await tx.clientRequestPackage.deleteMany({ where: { clientId: client.id } });
        await tx.clientRequestFile.deleteMany({ where: { clientId: client.id } });
        await tx.clientRequestComment.deleteMany({ where: { clientId: client.id } });
        await tx.clientRequestEvent.deleteMany({ where: { clientId: client.id } });
        await tx.clientNotification.deleteMany({ where: { clientId: client.id } });
        await tx.logisticsDeliveryRequest.deleteMany({ where: { clientId: client.id } });
        await tx.billingInvoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.billingPayment.deleteMany({ where: { clientId: client.id } });
        await tx.billingInvoice.deleteMany({ where: { clientId: client.id } });
        await tx.billingCharge.deleteMany({ where: { clientId: client.id } });
        await tx.clientRequestItem.deleteMany({ where: { requestId: { in: requestIds } } });
        await tx.clientRequest.deleteMany({ where: { clientId: client.id } });
        await tx.clientBillingService.deleteMany({ where: { clientId: client.id } });
        await tx.clientNotificationPreference.deleteMany({ where: { clientId: client.id } });
        await tx.clientMarketplaceConnection.deleteMany({ where: { clientId: client.id } });
        await tx.clientAllowedIp.deleteMany({ where: { clientId: client.id } });
        await tx.clientArticleMapping.deleteMany({ where: { clientId: client.id } });
        await tx.productMark.deleteMany({ where: { clientId: client.id } });
        await tx.stockBalance.deleteMany({ where: { clientId: client.id } });
        await tx.stockMovement.deleteMany({ where: { clientId: client.id } });
        await tx.barcode.deleteMany({ where: { skuId: { in: skuIds } } });
        await tx.sku.deleteMany({ where: { clientId: client.id } });
        await tx.box.deleteMany({ where: { clientId: client.id } });
        await tx.pallet.deleteMany({ where: { clientId: client.id } });
        await tx.userClient.deleteMany({ where: { clientId: client.id } });
        await tx.client.delete({ where: { id: client.id } });
      }

      if (userIds.length > 0) {
        await tx.tsdDevice.deleteMany({ where: { userId: { in: userIds } } });
        await tx.tsdOperation.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } });
        await tx.tsdOperation.updateMany({ where: { reviewedByUserId: { in: userIds } }, data: { reviewedByUserId: null } });
        await tx.auditLog.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } });
        await tx.userSession.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userPrinterGroup.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userClient.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });
  }

  private async getDemoSummary(clientId: string) {
    const [skus, balances, boxes, requests, invoices, notifications] = await Promise.all([
      this.prisma.sku.count({ where: { clientId } }),
      this.prisma.stockBalance.aggregate({ where: { clientId }, _sum: { quantity: true }, _count: { _all: true } }),
      this.prisma.box.count({ where: { clientId } }),
      this.prisma.clientRequest.count({ where: { clientId } }),
      this.prisma.billingInvoice.aggregate({ where: { clientId }, _count: { _all: true }, _sum: { totalRub: true } }),
      this.prisma.clientNotification.count({ where: { clientId } }),
    ]);

    return {
      skus,
      stockRows: balances._count._all,
      stockQuantity: balances._sum.quantity ?? 0,
      boxes,
      requests,
      invoices: invoices._count._all,
      invoiceTotalRub: invoices._sum.totalRub ?? 0,
      notifications,
    };
  }

  private saveDemoSetting(enabled: boolean, userId: string) {
    return this.prisma.systemSetting.upsert({
      where: { key: DEMO_MODE_SETTING_KEY },
      update: {
        value: { enabled },
        updatedByUserId: userId,
      },
      create: {
        key: DEMO_MODE_SETTING_KEY,
        value: { enabled },
        updatedByUserId: userId,
      },
    });
  }

  private isDemoSettingEnabled(value: unknown) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).enabled === true);
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

  private async getClientRequestsSummary(clientId: string) {
    const [
      requests,
      items,
      files,
      comments,
      events,
      packages,
      packageItems,
      pickWaveLinks,
      notifications,
      billingCharges,
      deliveryRequests,
      byStatus,
      byType,
    ] = await Promise.all([
      this.prisma.clientRequest.count({ where: { clientId } }),
      this.prisma.clientRequestItem.count({ where: { request: { clientId } } }),
      this.prisma.clientRequestFile.count({ where: { clientId } }),
      this.prisma.clientRequestComment.count({ where: { clientId } }),
      this.prisma.clientRequestEvent.count({ where: { clientId } }),
      this.prisma.clientRequestPackage.count({ where: { clientId } }),
      this.prisma.clientRequestPackageItem.count({ where: { package: { clientId } } }),
      this.prisma.pickWaveRequest.count({ where: { request: { clientId } } }),
      this.prisma.clientNotification.count({ where: { clientId, requestId: { not: null } } }),
      this.prisma.billingCharge.count({ where: { clientId, requestId: { not: null } } }),
      this.prisma.logisticsDeliveryRequest.count({ where: { clientId, requestId: { not: null } } }),
      this.prisma.clientRequest.groupBy({
        by: ['status'],
        where: { clientId },
        _count: { _all: true },
      }),
      this.prisma.clientRequest.groupBy({
        by: ['type'],
        where: { clientId },
        _count: { _all: true },
      }),
    ]);

    return {
      requests,
      items,
      files,
      comments,
      events,
      packages,
      packageItems,
      pickWaveLinks,
      notifications,
      billingCharges,
      deliveryRequests,
      byStatus: Object.fromEntries(byStatus.map((item) => [item.status, item._count._all])),
      byType: Object.fromEntries(byType.map((item) => [item.type, item._count._all])),
    };
  }

  private findTsdReceiptOperation(kiz: string) {
    return this.prisma.tsdOperation.findFirst({
      where: {
        operationType: 'receipt_scan',
        payload: {
          path: ['kiz'],
          equals: kiz,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findOutboundMovementForMark(mark: {
    clientId: string;
    skuId: string;
    boxId: string | null;
    createdAt: Date;
  }) {
    const movement = await this.prisma.stockMovement.findFirst({
      where: {
        clientId: mark.clientId,
        skuId: mark.skuId,
        boxId: mark.boxId,
        type: { in: [MovementType.PICK, MovementType.PACK, MovementType.SHIP] },
        quantity: { lt: 0 },
        createdAt: { gte: mark.createdAt },
        sourceDocument: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    const request = movement?.sourceDocument
      ? await this.prisma.clientRequest.findUnique({
          where: { id: movement.sourceDocument },
          select: {
            id: true,
            title: true,
            status: true,
            destinationCity: true,
            createdAt: true,
          },
        })
      : null;

    return movement ? { ...movement, request } : null;
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

const demoSkus = [
  {
    internalSku: 'DEMO-SUIT-XL',
    clientSku: 'WB-DEMO-1001',
    article: '2045048739732',
    name: 'Костюм спортивный LOGOff демо',
    brand: 'LOGOff demo',
    category: 'Одежда',
    color: 'темный меланж',
    size: 'XL / 50',
    barcode: '2049156013678',
    lengthCm: 43,
    widthCm: 33,
    heightCm: 6,
    volumeLiters: 8.514,
  },
  {
    internalSku: 'DEMO-TSHIRT-M',
    clientSku: 'WB-DEMO-1002',
    article: '2042311766600',
    name: 'Футболка базовая LOGOff',
    brand: 'LOGOff demo',
    category: 'Одежда',
    color: 'белый',
    size: 'M / 46',
    barcode: '4607000011112',
    lengthCm: 32,
    widthCm: 24,
    heightCm: 3,
    volumeLiters: 2.304,
  },
  {
    internalSku: 'DEMO-HOODIE-L',
    clientSku: 'WB-DEMO-1003',
    article: '2042311766617',
    name: 'Худи хлопковое LOGOff',
    brand: 'LOGOff demo',
    category: 'Одежда',
    color: 'графит',
    size: 'L / 48',
    barcode: '4607000011129',
    lengthCm: 38,
    widthCm: 30,
    heightCm: 8,
    volumeLiters: 9.12,
  },
  {
    internalSku: 'DEMO-GIFT-SET',
    clientSku: 'WB-DEMO-1004',
    article: '2042311766624',
    name: 'Подарочный набор LOGOff',
    brand: 'LOGOff demo',
    category: 'Подарки',
    color: 'красный',
    size: 'one size',
    barcode: '4607000011136',
    lengthCm: 24,
    widthCm: 18,
    heightCm: 10,
    volumeLiters: 4.32,
  },
];
