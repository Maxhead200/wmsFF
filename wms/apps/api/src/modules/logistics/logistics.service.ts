import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LogisticsPricingMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { LogisticsDirection as ParsedLogisticsDirection } from '../imports/parsers/logistics-xlsx.parser';
import { QuoteLogisticsDto } from './dto/quote-logistics.dto';

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
  constructor(private readonly prisma: PrismaService) {}

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
