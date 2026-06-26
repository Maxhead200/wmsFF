import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingChargeSource,
  BillingChargeStatus,
  BillingUnit,
  LogisticsDeliveryStatus,
  LogisticsPricingMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import type { LogisticsDirection as ParsedLogisticsDirection } from '../imports/parsers/logistics-xlsx.parser';
import { CreateDeliveryRequestDto } from './dto/create-delivery-request.dto';
import { FinalizeDeliveryQuoteDto } from './dto/finalize-delivery-quote.dto';
import { ListDeliveryRequestsDto } from './dto/list-delivery-requests.dto';
import { QuoteLogisticsDto } from './dto/quote-logistics.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

type ParsedLogisticsTariffSet = {
  note: string;
  directions: ParsedLogisticsDirection[];
  issues: Array<{ row: number; message: string }>;
};

type CommitLogisticsTariffSetOptions = {
  name: string;
  sourceFile?: string;
  activeFrom?: string;
  activeTo?: string;
};

type RateTierLike = {
  label: string;
  minPallets: number | null;
  maxPallets: number | null;
  maxBoxes: number | null;
  priceRub: Prisma.Decimal | number;
  pricingMode: LogisticsPricingMode;
};

@Injectable()
export class LogisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  listTariffSets() {
    return this.prisma.logisticsTariffSet.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { directions: true } },
      },
    });
  }

  getTariffSet(id: string) {
    return this.prisma.logisticsTariffSet.findUniqueOrThrow({
      where: { id },
      include: {
        directions: {
          orderBy: [{ origin: 'asc' }, { destination: 'asc' }],
          include: { tiers: { orderBy: [{ maxBoxes: 'asc' }, { minPallets: 'asc' }] } },
        },
      },
    });
  }

  async commitTariffSet(parsed: ParsedLogisticsTariffSet, options: CommitLogisticsTariffSetOptions) {
    if (parsed.issues.length > 0) {
      throw new BadRequestException({
        message: 'Файл содержит ошибки, импорт тарифов логистики остановлен.',
        issues: parsed.issues,
      });
    }

    const directions = parsed.directions.filter((direction) => direction.tiers.length > 0);
    if (directions.length === 0) {
      throw new BadRequestException('В файле не найдено ни одного направления с тарифами.');
    }

    return this.prisma.logisticsTariffSet.create({
      data: {
        name: options.name,
        sourceFile: options.sourceFile,
        note: parsed.note || null,
        activeFrom: this.parseDate(options.activeFrom),
        activeTo: this.parseDate(options.activeTo),
        directions: {
          create: directions.map((direction) => ({
            origin: direction.origin,
            destination: direction.destination,
            note: parsed.note || null,
            pricingMode: direction.pricingMode as LogisticsPricingMode,
            tiers: {
              create: direction.tiers.map((tier) => ({
                label: tier.label,
                minPallets: tier.minPallets,
                maxPallets: tier.maxPallets,
                maxBoxes: tier.maxBoxes,
                pricingMode: tier.pricingMode as LogisticsPricingMode,
                priceRub: tier.priceRub,
              })),
            },
          })),
        },
      },
      include: {
        directions: {
          include: { tiers: true },
        },
      },
    });
  }

  async quote(dto: QuoteLogisticsDto) {
    if (Boolean(dto.boxes) === Boolean(dto.pallets)) {
      throw new BadRequestException('Для расчета передайте ровно одно значение: boxes или pallets.');
    }

    const quoteDate = dto.quoteDate ? new Date(dto.quoteDate) : new Date();
    const tariffSet = dto.tariffSetId
      ? await this.prisma.logisticsTariffSet.findUnique({ where: { id: dto.tariffSetId } })
      : await this.findActiveTariffSet(quoteDate);

    if (!tariffSet) {
      throw new NotFoundException('Активный набор тарифов логистики не найден.');
    }

    const directions = await this.prisma.logisticsDirection.findMany({
      where: { tariffSetId: tariffSet.id },
      include: { tiers: true },
    });

    const direction = directions.find(
      (item) =>
        this.normalizePoint(item.origin) === this.normalizePoint(dto.origin) &&
        this.normalizePoint(item.destination) === this.normalizePoint(dto.destination),
    );

    if (!direction) {
      throw new NotFoundException('Направление логистики не найдено в выбранном наборе тарифов.');
    }

    const tier = this.selectRateTier(direction.tiers, { boxes: dto.boxes, pallets: dto.pallets });
    const estimatedTotalRub = this.calculateQuoteTotal(tier, dto.pallets);

    return {
      tariffSet: {
        id: tariffSet.id,
        name: tariffSet.name,
        sourceFile: tariffSet.sourceFile,
      },
      route: {
        origin: direction.origin,
        destination: direction.destination,
      },
      input: {
        boxes: dto.boxes ?? null,
        pallets: dto.pallets ?? null,
      },
      tier: this.serializeTier(tier),
      estimatedTotalRub,
      requiresManualReview: tier.pricingMode === LogisticsPricingMode.MANUAL_REVIEW,
      note: tier.pricingMode === LogisticsPricingMode.MANUAL_REVIEW ? direction.note : tariffSet.note,
    };
  }

  listDeliveryRequests(query: ListDeliveryRequestsDto, user: AuthUser) {
    return this.prisma.logisticsDeliveryRequest.findMany({
      where: {
        clientId: this.clientScopes.resolveClientFilter(user, query.clientId),
        status: query.status,
      },
      include: deliveryRequestInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });
  }

  async createDeliveryRequest(dto: CreateDeliveryRequestDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    const clientRequest = dto.requestId
      ? await this.prisma.clientRequest.findFirst({
          where: {
            id: dto.requestId,
            clientId: dto.clientId,
          },
          select: { id: true },
        })
      : null;

    if (dto.requestId && !clientRequest) {
      throw new BadRequestException('Связанная клиентская заявка не найдена у выбранного клиента.');
    }

    const quote = await this.tryQuoteForDelivery(dto);
    const status = quote.estimatedTotalRub != null && !quote.requiresManualReview
      ? LogisticsDeliveryStatus.QUOTED
      : LogisticsDeliveryStatus.REQUESTED;

    // Русский комментарий: заявку создаем даже при ручном тарифе, чтобы менеджер не терял обращение клиента.
    return this.prisma.logisticsDeliveryRequest.create({
      data: {
        clientId: dto.clientId,
        requestId: dto.requestId,
        tariffSetId: quote.tariffSetId ?? dto.tariffSetId,
        origin: dto.origin.trim(),
        destination: dto.destination.trim(),
        boxes: dto.boxes,
        pallets: dto.pallets,
        desiredShipDate: this.parseDate(dto.desiredShipDate),
        status,
        estimatedTotalRub: quote.estimatedTotalRub,
        requiresManualReview: quote.requiresManualReview,
        comment: normalizeText(dto.comment),
        managerComment: quote.note,
        createdByUserId: user.id,
      },
      include: deliveryRequestInclude,
    });
  }

  async updateDeliveryStatus(id: string, dto: UpdateDeliveryStatusDto, user: AuthUser) {
    const request = await this.prisma.logisticsDeliveryRequest.findUnique({
      where: { id },
      select: { id: true, clientId: true },
    });

    if (!request) {
      throw new NotFoundException('Заявка на доставку не найдена.');
    }

    this.clientScopes.requireClientAccess(user, request.clientId, 'write');

    return this.prisma.logisticsDeliveryRequest.update({
      where: { id },
      data: {
        status: dto.status,
        plannedShipDate: this.parseDate(dto.plannedShipDate),
        managerComment: normalizeText(dto.managerComment),
      },
      include: deliveryRequestInclude,
    });
  }

  async finalizeDeliveryQuote(id: string, dto: FinalizeDeliveryQuoteDto, user: AuthUser) {
    const request = await this.prisma.logisticsDeliveryRequest.findUnique({
      where: { id },
      select: {
        id: true,
        clientId: true,
        status: true,
        billingChargeId: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Заявка на доставку не найдена.');
    }

    this.clientScopes.requireClientAccess(user, request.clientId, 'write');

    if (request.billingChargeId) {
      throw new BadRequestException('Доставка уже связана с начислением, сумму нельзя менять.');
    }

    if (request.status === LogisticsDeliveryStatus.CANCELLED) {
      throw new BadRequestException('Нельзя финализировать расчет отмененной доставки.');
    }

    const nextStatus =
      request.status === LogisticsDeliveryStatus.REQUESTED ? LogisticsDeliveryStatus.QUOTED : request.status;

    // Русский комментарий: ручная финализация снимает флаг проверки и открывает доставку для дальнейшего workflow/биллинга.
    return this.prisma.logisticsDeliveryRequest.update({
      where: { id },
      data: {
        estimatedTotalRub: dto.estimatedTotalRub,
        requiresManualReview: false,
        status: nextStatus,
        managerComment: normalizeText(dto.managerComment),
      },
      include: deliveryRequestInclude,
    });
  }

  async generateDeliveryBillingCharge(id: string, user: AuthUser) {
    const request = await this.prisma.logisticsDeliveryRequest.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, code: true, name: true } },
        request: { select: { id: true, title: true } },
        tariffSet: { select: { id: true, name: true } },
        billingCharge: { select: { id: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Заявка на доставку не найдена.');
    }

    this.clientScopes.requireClientAccess(user, request.clientId, 'write');

    if (request.billingChargeId) {
      return this.prisma.logisticsDeliveryRequest.findUniqueOrThrow({
        where: { id },
        include: deliveryRequestInclude,
      });
    }

    if (request.status !== LogisticsDeliveryStatus.DELIVERED) {
      throw new BadRequestException('Начисление доставки можно создать только после статуса "Доставлена".');
    }

    if (request.requiresManualReview || request.estimatedTotalRub == null) {
      throw new BadRequestException('Для доставки нужен финальный расчет тарифа перед начислением.');
    }

    const sourceKey = deliverySourceKey(request.id);
    const totalRub = Number(request.estimatedTotalRub);
    if (!Number.isFinite(totalRub) || totalRub <= 0) {
      throw new BadRequestException('Некорректная сумма доставки для начисления.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingCharge = await tx.billingCharge.findFirst({
        where: { sourceKey },
        select: { id: true },
      });

      const charge =
        existingCharge ??
        (await tx.billingCharge.create({
          data: {
            clientId: request.clientId,
            serviceId: (await ensureDeliveryBillingService(tx)).id,
            requestId: request.requestId,
            description: `Доставка ${request.origin} -> ${request.destination}`,
            unit: BillingUnit.SERVICE,
            quantity: 1,
            unitPriceRub: totalRub,
            totalRub,
            status: BillingChargeStatus.APPROVED,
            serviceDate: request.plannedShipDate ?? request.desiredShipDate ?? new Date(),
            source: BillingChargeSource.LOGISTICS,
            sourceKey,
            metadata: {
              deliveryRequestId: request.id,
              route: {
                origin: request.origin,
                destination: request.destination,
              },
              boxes: request.boxes,
              pallets: request.pallets,
              tariffSetId: request.tariffSetId,
              tariffSetName: request.tariffSet?.name ?? null,
              clientRequestId: request.requestId,
            },
            comment: request.managerComment ?? request.comment,
            createdByUserId: user.id,
            approvedByUserId: user.id,
            approvedAt: new Date(),
          },
          select: { id: true },
        }));

      // Русский комментарий: связь хранится в заявке, чтобы в логистике сразу было видно, что доставка уже ушла в биллинг.
      return tx.logisticsDeliveryRequest.update({
        where: { id: request.id },
        data: { billingChargeId: charge.id },
        include: deliveryRequestInclude,
      });
    });
  }

  selectRateTier(tiers: RateTierLike[], input: { boxes?: number; pallets?: number }) {
    if (input.boxes != null) {
      const candidates = tiers
        .filter((tier) => tier.maxBoxes != null && input.boxes != null && input.boxes <= tier.maxBoxes)
        .sort((left, right) => (left.maxBoxes ?? Number.MAX_SAFE_INTEGER) - (right.maxBoxes ?? Number.MAX_SAFE_INTEGER));

      if (candidates[0]) {
        return candidates[0];
      }
    }

    if (input.pallets != null) {
      const candidates = tiers
        .filter((tier) => this.isPalletTierMatch(tier, input.pallets as number))
        .sort((left, right) => this.palletTierRank(right) - this.palletTierRank(left));

      if (candidates[0]) {
        return candidates[0];
      }
    }

    throw new BadRequestException('Подходящая ступень тарифа для указанного количества не найдена.');
  }

  calculateQuoteTotal(tier: RateTierLike, pallets?: number) {
    const priceRub = Number(tier.priceRub);

    if (tier.pricingMode === LogisticsPricingMode.TOTAL) {
      return priceRub;
    }

    if (tier.pricingMode === LogisticsPricingMode.PER_PALLET && pallets != null) {
      return Number((priceRub * pallets).toFixed(2));
    }

    // Русский комментарий: неоднозначные строки показываем оператору без автоумножения, чтобы не сделать неверный счет.
    return null;
  }

  private findActiveTariffSet(at: Date) {
    return this.prisma.logisticsTariffSet.findFirst({
      where: {
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: at } }] },
          { OR: [{ activeTo: null }, { activeTo: { gte: at } }] },
        ],
      },
      orderBy: [{ activeFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private isPalletTierMatch(tier: RateTierLike, pallets: number) {
    if (tier.maxBoxes != null) {
      return false;
    }

    const minPallets = tier.minPallets ?? 1;
    const maxPallets = tier.maxPallets ?? Number.MAX_SAFE_INTEGER;
    return pallets >= minPallets && pallets <= maxPallets;
  }

  private palletTierRank(tier: RateTierLike) {
    const min = tier.minPallets ?? 1;
    const max = tier.maxPallets ?? Number.MAX_SAFE_INTEGER;
    const specificity = tier.maxPallets == null ? 0 : tier.minPallets === tier.maxPallets ? 2 : 1;
    return specificity * 1_000_000 + min * 1_000 - (max === Number.MAX_SAFE_INTEGER ? 999 : max - min);
  }

  private serializeTier(tier: RateTierLike) {
    return {
      label: tier.label,
      minPallets: tier.minPallets,
      maxPallets: tier.maxPallets,
      maxBoxes: tier.maxBoxes,
      pricingMode: tier.pricingMode,
      priceRub: Number(tier.priceRub),
    };
  }

  private async tryQuoteForDelivery(dto: CreateDeliveryRequestDto) {
    try {
      const quote = await this.quote({
        tariffSetId: dto.tariffSetId,
        origin: dto.origin,
        destination: dto.destination,
        boxes: dto.boxes,
        pallets: dto.pallets,
        quoteDate: dto.desiredShipDate,
      });

      return {
        tariffSetId: quote.tariffSet.id,
        estimatedTotalRub: quote.estimatedTotalRub,
        requiresManualReview: quote.requiresManualReview || quote.estimatedTotalRub == null,
        note: quote.note,
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Требуется ручной расчет логистики.';

      return {
        tariffSetId: dto.tariffSetId,
        estimatedTotalRub: null,
        requiresManualReview: true,
        note: message,
      };
    }
  }

  private normalizePoint(value: string) {
    return value.toLowerCase().replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
  }

  private parseDate(value?: string) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Некорректная дата тарифа: ${value}`);
    }

    return date;
  }
}

const DELIVERY_SERVICE_CODE = 'LOGISTICS_DELIVERY';

const deliveryRequestInclude = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  request: {
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
    },
  },
  tariffSet: {
    select: {
      id: true,
      name: true,
    },
  },
  billingCharge: {
    select: {
      id: true,
      description: true,
      status: true,
      totalRub: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.LogisticsDeliveryRequestInclude;

function ensureDeliveryBillingService(tx: Prisma.TransactionClient) {
  return tx.billingService.upsert({
    where: { code: DELIVERY_SERVICE_CODE },
    update: {
      name: 'Доставка по заявке',
      unit: BillingUnit.SERVICE,
      isActive: true,
    },
    create: {
      code: DELIVERY_SERVICE_CODE,
      name: 'Доставка по заявке',
      unit: BillingUnit.SERVICE,
      isActive: true,
    },
  });
}

function deliverySourceKey(deliveryRequestId: string) {
  return `logistics-delivery:${deliveryRequestId}`;
}

function normalizeText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
