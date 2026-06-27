import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingChargeSource,
  BillingChargeStatus,
  BillingInvoiceStatus,
  BillingUnit,
  ClientNotificationEvent,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { isClientNotificationEnabled } from '../client-notifications/client-notification-preferences';
import { CreateBillingChargeDto } from './dto/create-billing-charge.dto';
import { CreateBillingInvoiceDto } from './dto/create-billing-invoice.dto';
import { CreateBillingPaymentDto } from './dto/create-billing-payment.dto';
import { CreateBillingServiceDto } from './dto/create-billing-service.dto';
import { GenerateStorageChargeDto } from './dto/generate-storage-charge.dto';
import { ListBillingChargesDto } from './dto/list-billing-charges.dto';
import { ListBillingInvoicesDto } from './dto/list-billing-invoices.dto';
import { ListBillingReconciliationDto } from './dto/list-billing-reconciliation.dto';
import { ListBillingServiceHistoryDto } from './dto/list-billing-service-history.dto';
import { UpdateBillingChargeStatusDto } from './dto/update-billing-charge-status.dto';
import { UpdateBillingInvoiceStatusDto } from './dto/update-billing-invoice-status.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  listServices() {
    return this.prisma.billingService.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  createService(dto: CreateBillingServiceDto, user: AuthUser) {
    this.clientScopes.requireGlobalClientAccess(user);

    // Русский комментарий: service code нужен для будущих автоматических начислений из операций склада/логистики.
    return this.prisma.billingService.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        unit: dto.unit ?? BillingUnit.SERVICE,
        defaultPriceRub: dto.defaultPriceRub,
        isActive: dto.isActive ?? true,
      },
    });
  }

  listCharges(query: ListBillingChargesDto, user: AuthUser) {
    const where: Prisma.BillingChargeWhereInput = {
      clientId: this.clientScopes.resolveClientFilter(user, query.clientId),
      status: query.status,
    };

    return this.prisma.billingCharge.findMany({
      where,
      include: billingChargeInclude,
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  async listServiceHistory(query: ListBillingServiceHistoryDto, user: AuthUser) {
    const periodFrom = query.periodFrom ? parseDate(query.periodFrom) : undefined;
    const periodTo = query.periodTo ? parseDate(query.periodTo, 'endOfDay') : undefined;
    if (periodFrom && periodTo && periodFrom > periodTo) {
      throw new BadRequestException('Дата начала периода не может быть позже даты окончания.');
    }

    const charges = await this.prisma.billingCharge.findMany({
      where: {
        clientId: this.clientScopes.resolveClientFilter(user, query.clientId),
        serviceDate:
          periodFrom || periodTo
            ? {
                gte: periodFrom,
                lte: periodTo,
              }
            : undefined,
      },
      include: billingChargeInclude,
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return buildServiceHistory(charges, periodFrom, periodTo);
  }

  async listReconciliation(query: ListBillingReconciliationDto, user: AuthUser) {
    const periodFrom = query.periodFrom ? parseDate(query.periodFrom) : undefined;
    const periodTo = query.periodTo ? parseDate(query.periodTo, 'endOfDay') : undefined;
    if (periodFrom && periodTo && periodFrom > periodTo) {
      throw new BadRequestException('Дата начала периода не может быть позже даты окончания.');
    }

    const invoices = await this.prisma.billingInvoice.findMany({
      where: {
        clientId: this.clientScopes.resolveClientFilter(user, query.clientId),
        status: { not: BillingInvoiceStatus.CANCELLED },
        periodFrom: periodFrom ? { gte: periodFrom } : undefined,
        periodTo: periodTo ? { lte: periodTo } : undefined,
      },
      include: billingReconciliationInvoiceInclude,
      orderBy: [{ dueDate: 'asc' }, { periodFrom: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return buildBillingReconciliation(invoices, periodFrom, periodTo);
  }

  async createCharge(dto: CreateBillingChargeDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    const [service] = await Promise.all([
      dto.serviceId
        ? this.prisma.billingService.findUnique({
            where: { id: dto.serviceId },
          })
        : Promise.resolve(null),
      this.ensureRequestBelongsToClient(dto.clientId, dto.requestId),
    ]);

    if (dto.serviceId && !service) {
      throw new NotFoundException('Услуга биллинга не найдена.');
    }

    const unit = dto.unit ?? service?.unit ?? BillingUnit.SERVICE;
    const unitPriceRub = dto.unitPriceRub ?? decimalToNumber(service?.defaultPriceRub);
    if (unitPriceRub == null) {
      throw new BadRequestException('Для начисления нужна цена за единицу.');
    }

    const description = normalizeText(dto.description) ?? service?.name;
    if (!description) {
      throw new BadRequestException('Для начисления нужно описание или выбранная услуга.');
    }

    const totalRub = roundMoney(dto.quantity * unitPriceRub);

    return this.prisma.billingCharge.create({
      data: {
        clientId: dto.clientId,
        serviceId: dto.serviceId,
        requestId: dto.requestId,
        description,
        unit,
        quantity: dto.quantity,
        unitPriceRub,
        totalRub,
        serviceDate: dto.serviceDate ? new Date(dto.serviceDate) : undefined,
        comment: normalizeText(dto.comment),
        createdByUserId: user.id,
      },
      include: billingChargeInclude,
    });
  }

  async generateStorageCharge(dto: GenerateStorageChargeDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    const periodFrom = parseDate(dto.periodFrom);
    const periodTo = parseDate(dto.periodTo, 'endOfDay');
    if (periodFrom > periodTo) {
      throw new BadRequestException('Дата начала периода не может быть позже даты окончания.');
    }

    const sourceKey = storageSourceKey(dto.clientId, periodFrom, periodTo);
    const existingCharge = await this.prisma.billingCharge.findFirst({
      where: { sourceKey },
      include: {
        ...billingChargeInclude,
        invoiceItems: {
          select: {
            id: true,
            invoice: { select: { id: true, number: true, status: true } },
          },
        },
      },
    });

    const storageService = await this.ensureStorageService();
    const client = this.prisma.client?.findUnique
      ? await this.prisma.client.findUnique({
          where: { id: dto.clientId },
          select: { storagePriceRubPerLiterDay: true },
        })
      : null;
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        clientId: dto.clientId,
        createdAt: { lte: periodTo },
      },
      select: {
        skuId: true,
        status: true,
        quantity: true,
        createdAt: true,
        sku: {
          select: {
            id: true,
            internalSku: true,
            name: true,
            volumeLiters: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const balances =
      movements.length === 0
        ? await this.prisma.stockBalance.findMany({
            where: {
              clientId: dto.clientId,
              quantity: { gt: 0 },
            },
            include: {
              sku: {
                select: {
                  id: true,
                  internalSku: true,
                  name: true,
                  volumeLiters: true,
                },
              },
            },
          })
        : [];

    const unitPriceRub =
      dto.unitPriceRub ?? decimalToNumber(client?.storagePriceRubPerLiterDay) ?? decimalToNumber(storageService.defaultPriceRub);
    if (unitPriceRub == null) {
      throw new BadRequestException('Для хранения нужна цена за литро-день.');
    }

    const details =
      movements.length > 0
        ? calculateHistoricalStorageDetails(movements, periodFrom, periodTo)
        : calculateStorageDetails(balances, countInclusiveDays(periodFrom, periodTo));

    if (details.literDays <= 0) {
      throw new BadRequestException('Нет остатков с заполненным литражом для начисления хранения.');
    }

    const totalRub = roundMoney(details.literDays * unitPriceRub);
    const isApproved = dto.approve === true;
    const chargeData = {
      clientId: dto.clientId,
      serviceId: storageService.id,
      description: `Хранение по литражу ${formatDateKey(periodFrom)} - ${formatDateKey(periodTo)}`,
      unit: BillingUnit.LITER_DAY,
      quantity: details.literDays,
      unitPriceRub,
      totalRub,
      status: isApproved ? BillingChargeStatus.APPROVED : BillingChargeStatus.DRAFT,
      serviceDate: dto.serviceDate ? parseDate(dto.serviceDate) : periodTo,
      source: BillingChargeSource.STORAGE,
      sourceKey,
      metadata: {
        periodFrom: formatDateKey(periodFrom),
        periodTo: formatDateKey(periodTo),
        calculationMode: details.calculationMode,
        days: details.days,
        totalLiters: details.totalLiters,
        literDays: details.literDays,
        balancesCount: details.balancesCount,
        skippedWithoutVolume: details.skippedWithoutVolume,
        daily: details.daily,
        skuTotals: details.skuTotals,
      },
      comment: normalizeText(dto.comment),
      approvedByUserId: isApproved ? user.id : undefined,
      approvedAt: isApproved ? new Date() : undefined,
    } satisfies Prisma.BillingChargeUncheckedCreateInput;

    if (existingCharge) {
      const activeInvoiceItem = existingCharge.invoiceItems.find((item) => item.invoice.status !== BillingInvoiceStatus.CANCELLED);
      if (activeInvoiceItem) {
        throw new BadRequestException(`Начисление хранения уже включено в счет № ${activeInvoiceItem.invoice.number}.`);
      }

      return this.prisma.billingCharge.update({
        where: { id: existingCharge.id },
        data: chargeData,
        include: billingChargeInclude,
      });
    }

    // Русский комментарий: автоматическое хранение пишем одним начислением за период, а детализацию держим в metadata.
    return this.prisma.billingCharge.create({
      data: { ...chargeData, createdByUserId: user.id },
      include: billingChargeInclude,
    });
  }

  async updateChargeStatus(chargeId: string, dto: UpdateBillingChargeStatusDto, user: AuthUser) {
    const charge = await this.prisma.billingCharge.findUnique({
      where: { id: chargeId },
      select: { id: true, clientId: true },
    });

    if (!charge) {
      throw new NotFoundException('Начисление биллинга не найдено.');
    }

    this.clientScopes.requireClientAccess(user, charge.clientId, 'write');

    return this.prisma.billingCharge.update({
      where: { id: chargeId },
      data: {
        status: dto.status,
        approvedByUserId: dto.status === BillingChargeStatus.APPROVED ? user.id : null,
        approvedAt: dto.status === BillingChargeStatus.APPROVED ? new Date() : null,
      },
      include: billingChargeInclude,
    });
  }

  listInvoices(query: ListBillingInvoicesDto, user: AuthUser) {
    const where: Prisma.BillingInvoiceWhereInput = {
      clientId: this.clientScopes.resolveClientFilter(user, query.clientId),
      status: query.status,
      periodFrom: query.periodFrom ? { gte: parseDate(query.periodFrom) } : undefined,
      periodTo: query.periodTo ? { lte: parseDate(query.periodTo, 'endOfDay') } : undefined,
    };

    return this.prisma.billingInvoice.findMany({
      where,
      include: billingInvoiceInclude,
      orderBy: [{ periodFrom: 'desc' }, { createdAt: 'desc' }],
      take: 150,
    });
  }

  async createInvoice(dto: CreateBillingInvoiceDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    const periodFrom = parseDate(dto.periodFrom);
    const periodTo = parseDate(dto.periodTo, 'endOfDay');
    if (periodFrom > periodTo) {
      throw new BadRequestException('Дата начала периода не может быть позже даты окончания.');
    }

    const chargeIds = dto.chargeIds?.length ? [...new Set(dto.chargeIds)] : undefined;
    const charges = await this.prisma.billingCharge.findMany({
      where: {
        clientId: dto.clientId,
        id: chargeIds ? { in: chargeIds } : undefined,
        status: BillingChargeStatus.APPROVED,
        serviceDate: {
          gte: periodFrom,
          lte: periodTo,
        },
        invoiceItems: {
          none: {
            invoice: {
              status: {
                not: BillingInvoiceStatus.CANCELLED,
              },
            },
          },
        },
      },
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (chargeIds && charges.length !== chargeIds.length) {
      throw new BadRequestException('Не все выбранные начисления утверждены, входят в период или доступны для счета.');
    }

    if (charges.length === 0) {
      throw new BadRequestException('Для счета нет утвержденных начислений за выбранный период.');
    }

    const totalRub = roundMoney(charges.reduce((sum, charge) => sum + (decimalToNumber(charge.totalRub) ?? 0), 0));
    const number = await this.nextInvoiceNumber(periodFrom);

    // Русский комментарий: счет фиксирует снимок начислений, чтобы дальнейшая правка услуги не меняла уже выставленный документ.
    return this.prisma.billingInvoice.create({
      data: {
        number,
        clientId: dto.clientId,
        periodFrom,
        periodTo,
        dueDate: dto.dueDate ? parseDate(dto.dueDate, 'endOfDay') : undefined,
        totalRub,
        comment: normalizeText(dto.comment),
        createdByUserId: user.id,
        items: {
          create: charges.map((charge) => ({
            chargeId: charge.id,
            description: charge.description,
            unit: charge.unit,
            quantity: charge.quantity,
            unitPriceRub: charge.unitPriceRub,
            totalRub: charge.totalRub,
            serviceDate: charge.serviceDate,
          })),
        },
      },
      include: billingInvoiceInclude,
    });
  }

  async updateInvoiceStatus(invoiceId: string, dto: UpdateBillingInvoiceStatusDto, user: AuthUser) {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        number: true,
        clientId: true,
        status: true,
        totalRub: true,
        paidRub: true,
        issuedAt: true,
        paidAt: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Счет биллинга не найден.');
    }

    this.clientScopes.requireClientAccess(user, invoice.clientId, 'write');

    const paidRub = decimalToNumber(invoice.paidRub) ?? 0;
    const totalRub = decimalToNumber(invoice.totalRub) ?? 0;
    if (dto.status === BillingInvoiceStatus.CANCELLED && paidRub > 0) {
      throw new BadRequestException('Нельзя отменить счет с зафиксированными оплатами.');
    }

    if (dto.status === BillingInvoiceStatus.DRAFT && paidRub > 0) {
      throw new BadRequestException('Нельзя вернуть в черновик счет с оплатами.');
    }

    if (dto.status === BillingInvoiceStatus.PAID && paidRub < totalRub) {
      throw new BadRequestException('Счет нельзя закрыть как оплаченный, пока сумма оплат меньше итога.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingInvoice.update({
        where: { id: invoiceId },
        data: {
          status: dto.status,
          issuedAt:
            dto.status === BillingInvoiceStatus.DRAFT
              ? null
              : dto.status === BillingInvoiceStatus.ISSUED || dto.status === BillingInvoiceStatus.PAID
                ? invoice.issuedAt ?? new Date()
                : invoice.issuedAt,
          paidAt: dto.status === BillingInvoiceStatus.PAID ? invoice.paidAt ?? new Date() : null,
        },
        include: billingInvoiceInclude,
      });

      if (
        invoice.status !== dto.status &&
        (await isClientNotificationEnabled(tx, invoice.clientId, ClientNotificationEvent.BILLING_INVOICE_STATUS_CHANGED))
      ) {
        await tx.clientNotification.create({
          data: {
            clientId: invoice.clientId,
            title: 'Статус счета изменен',
            body: `Счет № ${invoice.number}: ${billingInvoiceStatusLabel(invoice.status)} -> ${billingInvoiceStatusLabel(dto.status)}`,
            severity: dto.status === BillingInvoiceStatus.PAID ? 'SUCCESS' : 'INFO',
            createdByUserId: user.id,
          },
        });
      }

      return updated;
    });
  }

  async createPayment(dto: CreateBillingPaymentDto, user: AuthUser) {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: dto.invoiceId },
      select: {
        id: true,
        number: true,
        clientId: true,
        status: true,
        totalRub: true,
        paidRub: true,
        issuedAt: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Счет биллинга не найден.');
    }

    this.clientScopes.requireClientAccess(user, invoice.clientId, 'write');

    if (invoice.status === BillingInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Нельзя принять оплату по отмененному счету.');
    }

    const totalRub = decimalToNumber(invoice.totalRub) ?? 0;
    const paidRub = decimalToNumber(invoice.paidRub) ?? 0;
    const remainingRub = roundMoney(totalRub - paidRub);
    if (dto.amountRub > remainingRub) {
      throw new BadRequestException('Сумма оплаты превышает остаток по счету.');
    }

    const paidAt = dto.paidAt ? parseDate(dto.paidAt) : new Date();
    const nextPaidRub = roundMoney(paidRub + dto.amountRub);
    const nextStatus = nextPaidRub >= totalRub ? BillingInvoiceStatus.PAID : BillingInvoiceStatus.ISSUED;

    return this.prisma.$transaction(async (tx) => {
      await tx.billingPayment.create({
        data: {
          invoiceId: invoice.id,
          clientId: invoice.clientId,
          amountRub: dto.amountRub,
          paidAt,
          method: normalizeText(dto.method),
          reference: normalizeText(dto.reference),
          comment: normalizeText(dto.comment),
          createdByUserId: user.id,
        },
      });

      const updated = await tx.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          paidRub: nextPaidRub,
          status: nextStatus,
          issuedAt: invoice.issuedAt ?? new Date(),
          paidAt: nextStatus === BillingInvoiceStatus.PAID ? paidAt : null,
        },
        include: billingInvoiceInclude,
      });

      if (await isClientNotificationEnabled(tx, invoice.clientId, ClientNotificationEvent.BILLING_PAYMENT_RECORDED)) {
        await tx.clientNotification.create({
          data: {
            clientId: invoice.clientId,
            title: 'Оплата по счету принята',
            body: `Счет № ${invoice.number}: ${formatRub(dto.amountRub)} руб. Оплачено ${formatRub(nextPaidRub)} из ${formatRub(totalRub)} руб.`,
            severity: nextStatus === BillingInvoiceStatus.PAID ? 'SUCCESS' : 'INFO',
            createdByUserId: user.id,
          },
        });
      }

      return updated;
    });
  }

  private async ensureRequestBelongsToClient(clientId: string, requestId?: string) {
    if (!requestId) {
      return;
    }

    const request = await this.prisma.clientRequest.findFirst({
      where: {
        id: requestId,
        clientId,
      },
      select: { id: true },
    });

    if (!request) {
      throw new BadRequestException('Заявка не принадлежит выбранному клиенту.');
    }
  }

  private async nextInvoiceNumber(periodFrom: Date) {
    const prefix = `INV-${periodFrom.getUTCFullYear()}${String(periodFrom.getUTCMonth() + 1).padStart(2, '0')}`;
    const count = await this.prisma.billingInvoice.count({
      where: {
        number: {
          startsWith: prefix,
        },
      },
    });

    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  private ensureStorageService() {
    return this.prisma.billingService.upsert({
      where: { code: STORAGE_SERVICE_CODE },
      update: {
        name: 'Хранение по литражу',
        unit: BillingUnit.LITER_DAY,
        isActive: true,
      },
      create: {
        code: STORAGE_SERVICE_CODE,
        name: 'Хранение по литражу',
        unit: BillingUnit.LITER_DAY,
        isActive: true,
      },
    });
  }
}

const STORAGE_SERVICE_CODE = 'STORAGE_LITER_DAY';

const billingChargeInclude = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  service: true,
  request: {
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  approvedBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.BillingChargeInclude;

const billingInvoiceInclude = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  items: {
    include: {
      charge: {
        select: {
          id: true,
          description: true,
          status: true,
        },
      },
    },
    orderBy: [{ serviceDate: 'asc' }, { id: 'asc' }],
  },
  payments: {
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
  },
} satisfies Prisma.BillingInvoiceInclude;

const billingReconciliationInvoiceInclude = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.BillingInvoiceInclude;

type BillingChargeWithRelations = Prisma.BillingChargeGetPayload<{ include: typeof billingChargeInclude }>;
type BillingInvoiceForReconciliation = Prisma.BillingInvoiceGetPayload<{
  include: typeof billingReconciliationInvoiceInclude;
}>;

type ServiceHistoryGroup = {
  key: string;
  clientId: string;
  serviceId: string | null;
  serviceCode: string;
  serviceName: string;
  source: BillingChargeSource;
  unit: BillingUnit;
  chargesCount: number;
  quantity: number;
  totalRub: number;
  draftRub: number;
  approvedRub: number;
  cancelledRub: number;
  firstServiceDate: string;
  lastServiceDate: string;
  latestStatus: BillingChargeStatus;
  charges: BillingChargeWithRelations[];
};

function buildServiceHistory(charges: BillingChargeWithRelations[], periodFrom?: Date, periodTo?: Date) {
  const groups = new Map<string, ServiceHistoryGroup>();
  const totals = {
    chargesCount: charges.length,
    totalRub: 0,
    draftRub: 0,
    approvedRub: 0,
    cancelledRub: 0,
  };

  charges.forEach((charge) => {
    const totalRub = decimalToNumber(charge.totalRub) ?? 0;
    const quantity = decimalToNumber(charge.quantity) ?? 0;
    const key = [
      charge.clientId,
      charge.serviceId ?? 'manual',
      charge.source,
      charge.unit,
      charge.serviceId ? '' : charge.description,
    ].join(':');

    totals.totalRub = roundMoney(totals.totalRub + totalRub);
    if (charge.status === BillingChargeStatus.APPROVED) {
      totals.approvedRub = roundMoney(totals.approvedRub + totalRub);
    } else if (charge.status === BillingChargeStatus.CANCELLED) {
      totals.cancelledRub = roundMoney(totals.cancelledRub + totalRub);
    } else {
      totals.draftRub = roundMoney(totals.draftRub + totalRub);
    }

    const serviceName = charge.service?.name ?? charge.description;
    const serviceCode = charge.service?.code ?? sourceCode(charge.source);
    const serviceDate = charge.serviceDate.toISOString();
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        clientId: charge.clientId,
        serviceId: charge.serviceId,
        serviceCode,
        serviceName,
        source: charge.source,
        unit: charge.unit,
        chargesCount: 1,
        quantity,
        totalRub,
        draftRub: charge.status === BillingChargeStatus.DRAFT ? totalRub : 0,
        approvedRub: charge.status === BillingChargeStatus.APPROVED ? totalRub : 0,
        cancelledRub: charge.status === BillingChargeStatus.CANCELLED ? totalRub : 0,
        firstServiceDate: serviceDate,
        lastServiceDate: serviceDate,
        latestStatus: charge.status,
        charges: [charge],
      });
      return;
    }

    existing.chargesCount += 1;
    existing.quantity = roundQuantity(existing.quantity + quantity);
    existing.totalRub = roundMoney(existing.totalRub + totalRub);
    existing.draftRub = roundMoney(existing.draftRub + (charge.status === BillingChargeStatus.DRAFT ? totalRub : 0));
    existing.approvedRub = roundMoney(
      existing.approvedRub + (charge.status === BillingChargeStatus.APPROVED ? totalRub : 0),
    );
    existing.cancelledRub = roundMoney(
      existing.cancelledRub + (charge.status === BillingChargeStatus.CANCELLED ? totalRub : 0),
    );
    existing.firstServiceDate = serviceDate < existing.firstServiceDate ? serviceDate : existing.firstServiceDate;
    existing.lastServiceDate = serviceDate > existing.lastServiceDate ? serviceDate : existing.lastServiceDate;
    existing.latestStatus = serviceDate >= existing.lastServiceDate ? charge.status : existing.latestStatus;
    existing.charges.push(charge);
  });

  return {
    periodFrom: periodFrom?.toISOString() ?? null,
    periodTo: periodTo?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    totals,
    groups: [...groups.values()].sort((left, right) => right.lastServiceDate.localeCompare(left.lastServiceDate)),
  };
}

function buildBillingReconciliation(
  invoices: BillingInvoiceForReconciliation[],
  periodFrom?: Date,
  periodTo?: Date,
  now = new Date(),
) {
  const clients = new Map<
    string,
    {
      client: { id: string; code: string; name: string };
      invoicesCount: number;
      openInvoicesCount: number;
      paidInvoicesCount: number;
      overdueInvoicesCount: number;
      totalRub: number;
      paidRub: number;
      debtRub: number;
      overdueRub: number;
      nearestDueDate: string | null;
      latestInvoiceDate: string | null;
      invoices: Array<{
        id: string;
        number: string;
        status: BillingInvoiceStatus;
        periodFrom: string;
        periodTo: string;
        dueDate: string | null;
        issuedAt: string | null;
        paidAt: string | null;
        totalRub: number;
        paidRub: number;
        remainingRub: number;
        overdueDays: number;
      }>;
    }
  >();

  const totals = {
    invoicesCount: 0,
    openInvoicesCount: 0,
    paidInvoicesCount: 0,
    overdueInvoicesCount: 0,
    totalRub: 0,
    paidRub: 0,
    debtRub: 0,
    overdueRub: 0,
  };

  invoices.forEach((invoice) => {
    const totalRub = decimalToNumber(invoice.totalRub) ?? 0;
    const paidRub = decimalToNumber(invoice.paidRub) ?? 0;
    const remainingRub = roundMoney(Math.max(0, totalRub - paidRub));
    const overdueDays = calculateOverdueDays(invoice.dueDate, remainingRub, invoice.status, now);
    const isOpen = remainingRub > 0 && invoice.status !== BillingInvoiceStatus.PAID;
    const isOverdue = overdueDays > 0;
    const issuedOrCreatedAt = (invoice.issuedAt ?? invoice.createdAt).toISOString();
    const dueDate = invoice.dueDate?.toISOString() ?? null;

    let client = clients.get(invoice.clientId);
    if (!client) {
      client = {
        client: invoice.client,
        invoicesCount: 0,
        openInvoicesCount: 0,
        paidInvoicesCount: 0,
        overdueInvoicesCount: 0,
        totalRub: 0,
        paidRub: 0,
        debtRub: 0,
        overdueRub: 0,
        nearestDueDate: null,
        latestInvoiceDate: null,
        invoices: [],
      };
      clients.set(invoice.clientId, client);
    }

    client.invoicesCount += 1;
    client.openInvoicesCount += isOpen ? 1 : 0;
    client.paidInvoicesCount += invoice.status === BillingInvoiceStatus.PAID ? 1 : 0;
    client.overdueInvoicesCount += isOverdue ? 1 : 0;
    client.totalRub = roundMoney(client.totalRub + totalRub);
    client.paidRub = roundMoney(client.paidRub + paidRub);
    client.debtRub = roundMoney(client.debtRub + remainingRub);
    client.overdueRub = roundMoney(client.overdueRub + (isOverdue ? remainingRub : 0));
    client.nearestDueDate =
      isOpen && dueDate && (!client.nearestDueDate || dueDate < client.nearestDueDate) ? dueDate : client.nearestDueDate;
    client.latestInvoiceDate =
      !client.latestInvoiceDate || issuedOrCreatedAt > client.latestInvoiceDate ? issuedOrCreatedAt : client.latestInvoiceDate;
    client.invoices.push({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      periodFrom: invoice.periodFrom.toISOString(),
      periodTo: invoice.periodTo.toISOString(),
      dueDate,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      totalRub,
      paidRub,
      remainingRub,
      overdueDays,
    });

    totals.invoicesCount += 1;
    totals.openInvoicesCount += isOpen ? 1 : 0;
    totals.paidInvoicesCount += invoice.status === BillingInvoiceStatus.PAID ? 1 : 0;
    totals.overdueInvoicesCount += isOverdue ? 1 : 0;
    totals.totalRub = roundMoney(totals.totalRub + totalRub);
    totals.paidRub = roundMoney(totals.paidRub + paidRub);
    totals.debtRub = roundMoney(totals.debtRub + remainingRub);
    totals.overdueRub = roundMoney(totals.overdueRub + (isOverdue ? remainingRub : 0));
  });

  return {
    periodFrom: periodFrom?.toISOString() ?? null,
    periodTo: periodTo?.toISOString() ?? null,
    generatedAt: now.toISOString(),
    totals,
    clients: [...clients.values()]
      .map((client) => ({
        ...client,
        invoices: client.invoices.sort((left, right) => {
          const leftDue = left.dueDate ?? '9999-12-31';
          const rightDue = right.dueDate ?? '9999-12-31';
          return leftDue.localeCompare(rightDue) || right.periodFrom.localeCompare(left.periodFrom);
        }),
      }))
      .sort((left, right) => right.debtRub - left.debtRub || right.overdueRub - left.overdueRub || left.client.code.localeCompare(right.client.code)),
  };
}

function calculateOverdueDays(
  dueDate: Date | null,
  remainingRub: number,
  status: BillingInvoiceStatus,
  now: Date,
) {
  if (!dueDate || remainingRub <= 0 || status === BillingInvoiceStatus.PAID || status === BillingInvoiceStatus.CANCELLED) {
    return 0;
  }

  const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (dueDay >= currentDay) {
    return 0;
  }

  return Math.max(1, Math.floor((currentDay - dueDay) / 86_400_000));
}

function normalizeText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function decimalToNumber(value: Prisma.Decimal | string | number | null | undefined) {
  return value == null ? undefined : Number(value);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function parseDate(value: string, mode: 'startOfDay' | 'endOfDay' = 'startOfDay') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Некорректная дата.');
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (mode === 'endOfDay') {
      date.setUTCHours(23, 59, 59, 999);
    } else {
      date.setUTCHours(0, 0, 0, 0);
    }
  }

  return date;
}

function countInclusiveDays(periodFrom: Date, periodTo: Date) {
  const from = Date.UTC(periodFrom.getUTCFullYear(), periodFrom.getUTCMonth(), periodFrom.getUTCDate());
  const to = Date.UTC(periodTo.getUTCFullYear(), periodTo.getUTCMonth(), periodTo.getUTCDate());
  return Math.floor((to - from) / 86_400_000) + 1;
}

function calculateStorageDetails(
  balances: Array<{ quantity: number; sku: { volumeLiters: Prisma.Decimal | string | number | null } }>,
  days: number,
) {
  let totalLiters = 0;
  let skippedWithoutVolume = 0;

  balances.forEach((balance) => {
    const volumeLiters = decimalToNumber(balance.sku.volumeLiters);
    if (!volumeLiters || volumeLiters <= 0) {
      skippedWithoutVolume += 1;
      return;
    }

    totalLiters += balance.quantity * volumeLiters;
  });

  const roundedLiters = roundQuantity(totalLiters);
  return {
    calculationMode: 'SNAPSHOT',
    days,
    totalLiters: roundedLiters,
    literDays: roundQuantity(roundedLiters * days),
    balancesCount: balances.length,
    skippedWithoutVolume,
    daily: [],
    skuTotals: [],
  };
}

function calculateHistoricalStorageDetails(
  movements: Array<{
    skuId: string;
    status: string;
    quantity: number;
    createdAt: Date;
    sku: {
      id: string;
      internalSku: string;
      name: string;
      volumeLiters: Prisma.Decimal | string | number | null;
    };
  }>,
  periodFrom: Date,
  periodTo: Date,
) {
  const sorted = [...movements].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const quantities = new Map<string, HistoricalBalanceState>();
  const skuTotals = new Map<string, HistoricalSkuTotal>();
  const daily: Array<{ date: string; totalLiters: number; literDays: number; positions: number }> = [];
  let movementIndex = 0;
  let skippedWithoutVolume = 0;
  let literDays = 0;
  let totalLitersSum = 0;
  const days = listPeriodDays(periodFrom, periodTo);

  days.forEach((day) => {
    const dayEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59, 999));

    while (movementIndex < sorted.length && sorted[movementIndex].createdAt <= dayEnd) {
      const movement = sorted[movementIndex];
      const volumeLiters = decimalToNumber(movement.sku.volumeLiters) ?? null;
      const key = `${movement.skuId}:${movement.status}`;
      const current =
        quantities.get(key) ??
        ({
          skuId: movement.skuId,
          status: movement.status,
          internalSku: movement.sku.internalSku,
          name: movement.sku.name,
          volumeLiters,
          quantity: 0,
        } satisfies HistoricalBalanceState);
      current.quantity += movement.quantity;
      quantities.set(key, current);

      if (!volumeLiters || volumeLiters <= 0) {
        skippedWithoutVolume += 1;
      }

      movementIndex += 1;
    }

    let dayLiters = 0;
    let positions = 0;
    quantities.forEach((state) => {
      if (state.quantity <= 0 || !state.volumeLiters || state.volumeLiters <= 0) {
        return;
      }

      const rowLiters = state.quantity * state.volumeLiters;
      dayLiters += rowLiters;
      positions += 1;

      const skuTotal =
        skuTotals.get(state.skuId) ??
        ({
          skuId: state.skuId,
          internalSku: state.internalSku,
          name: state.name,
          volumeLiters: state.volumeLiters,
          literDays: 0,
        } satisfies HistoricalSkuTotal);
      skuTotal.literDays += rowLiters;
      skuTotals.set(state.skuId, skuTotal);
    });

    const roundedDayLiters = roundQuantity(dayLiters);
    totalLitersSum += roundedDayLiters;
    literDays += roundedDayLiters;
    daily.push({
      date: formatDateKey(day),
      totalLiters: roundedDayLiters,
      literDays: roundedDayLiters,
      positions,
    });
  });

  return {
    calculationMode: 'LEDGER',
    days: days.length,
    totalLiters: roundQuantity(totalLitersSum / Math.max(days.length, 1)),
    literDays: roundQuantity(literDays),
    balancesCount: quantities.size,
    skippedWithoutVolume,
    daily,
    skuTotals: [...skuTotals.values()]
      .map((item) => ({
        skuId: item.skuId,
        internalSku: item.internalSku,
        name: item.name,
        volumeLiters: item.volumeLiters,
        literDays: roundQuantity(item.literDays),
      }))
      .sort((left, right) => right.literDays - left.literDays)
      .slice(0, 50),
  };
}

type HistoricalBalanceState = {
  skuId: string;
  status: string;
  internalSku: string;
  name: string;
  volumeLiters: number | null;
  quantity: number;
};

type HistoricalSkuTotal = {
  skuId: string;
  internalSku: string;
  name: string;
  volumeLiters: number;
  literDays: number;
};

function listPeriodDays(periodFrom: Date, periodTo: Date) {
  const days: Date[] = [];
  const cursor = new Date(Date.UTC(periodFrom.getUTCFullYear(), periodFrom.getUTCMonth(), periodFrom.getUTCDate()));
  const end = Date.UTC(periodTo.getUTCFullYear(), periodTo.getUTCMonth(), periodTo.getUTCDate());

  while (cursor.getTime() <= end) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function storageSourceKey(clientId: string, periodFrom: Date, periodTo: Date) {
  return `storage:${clientId}:${formatDateKey(periodFrom)}:${formatDateKey(periodTo)}`;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function billingInvoiceStatusLabel(status: BillingInvoiceStatus) {
  const labels: Record<BillingInvoiceStatus, string> = {
    [BillingInvoiceStatus.DRAFT]: 'черновик',
    [BillingInvoiceStatus.ISSUED]: 'выставлен',
    [BillingInvoiceStatus.PAID]: 'оплачен',
    [BillingInvoiceStatus.CANCELLED]: 'отменен',
  };

  return labels[status];
}

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
}

function sourceCode(source: BillingChargeSource) {
  if (source === BillingChargeSource.STORAGE) {
    return 'STORAGE';
  }

  if (source === BillingChargeSource.LOGISTICS) {
    return 'LOGISTICS';
  }

  return 'MANUAL';
}
