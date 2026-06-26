import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingChargeSource, BillingChargeStatus, BillingInvoiceStatus, BillingUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { CreateBillingChargeDto } from './dto/create-billing-charge.dto';
import { CreateBillingInvoiceDto } from './dto/create-billing-invoice.dto';
import { CreateBillingPaymentDto } from './dto/create-billing-payment.dto';
import { CreateBillingServiceDto } from './dto/create-billing-service.dto';
import { GenerateStorageChargeDto } from './dto/generate-storage-charge.dto';
import { ListBillingChargesDto } from './dto/list-billing-charges.dto';
import { ListBillingInvoicesDto } from './dto/list-billing-invoices.dto';
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
    const existingCharge = await this.prisma.billingCharge.findUnique({
      where: { sourceKey },
      include: billingChargeInclude,
    });
    if (existingCharge) {
      throw new BadRequestException('Начисление хранения за этот период уже создано.');
    }

    const [storageService, balances] = await Promise.all([
      this.ensureStorageService(),
      this.prisma.stockBalance.findMany({
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
      }),
    ]);

    const unitPriceRub = dto.unitPriceRub ?? decimalToNumber(storageService.defaultPriceRub);
    if (unitPriceRub == null) {
      throw new BadRequestException('Для хранения нужна цена за литро-день.');
    }

    const details = calculateStorageDetails(balances, countInclusiveDays(periodFrom, periodTo));
    if (details.literDays <= 0) {
      throw new BadRequestException('Нет остатков с заполненным литражом для начисления хранения.');
    }

    const totalRub = roundMoney(details.literDays * unitPriceRub);
    const isApproved = dto.approve === true;

    // Русский комментарий: автоматическое хранение пишем одним начислением за период, а детализацию держим в metadata.
    return this.prisma.billingCharge.create({
      data: {
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
          days: details.days,
          totalLiters: details.totalLiters,
          literDays: details.literDays,
          balancesCount: details.balancesCount,
          skippedWithoutVolume: details.skippedWithoutVolume,
        },
        comment: normalizeText(dto.comment),
        createdByUserId: user.id,
        approvedByUserId: isApproved ? user.id : undefined,
        approvedAt: isApproved ? new Date() : undefined,
      },
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

    return this.prisma.billingInvoice.update({
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
  }

  async createPayment(dto: CreateBillingPaymentDto, user: AuthUser) {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: dto.invoiceId },
      select: {
        id: true,
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

      return tx.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          paidRub: nextPaidRub,
          status: nextStatus,
          issuedAt: invoice.issuedAt ?? new Date(),
          paidAt: nextStatus === BillingInvoiceStatus.PAID ? paidAt : null,
        },
        include: billingInvoiceInclude,
      });
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
    days,
    totalLiters: roundedLiters,
    literDays: roundQuantity(roundedLiters * days),
    balancesCount: balances.length,
    skippedWithoutVolume,
  };
}

function storageSourceKey(clientId: string, periodFrom: Date, periodTo: Date) {
  return `storage:${clientId}:${formatDateKey(periodFrom)}:${formatDateKey(periodTo)}`;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
