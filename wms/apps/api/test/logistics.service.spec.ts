import { BadRequestException } from '@nestjs/common';
import { LogisticsPricingMode } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { LogisticsService } from '../src/modules/logistics/logistics.service';

describe('LogisticsService', () => {
  const service = new LogisticsService({} as never);

  it('выбирает более конкретную паллетную ступень вместо открытого диапазона', () => {
    const tier = service.selectRateTier(
      [
        {
          label: 'от 7 палет',
          minPallets: 7,
          maxPallets: null,
          maxBoxes: null,
          pricingMode: LogisticsPricingMode.PER_PALLET,
          priceRub: 4000,
        },
        {
          label: '18 палет',
          minPallets: 18,
          maxPallets: 18,
          maxBoxes: null,
          pricingMode: LogisticsPricingMode.PER_PALLET,
          priceRub: 3500,
        },
      ],
      { pallets: 18 },
    );

    expect(tier.label).toBe('18 палет');
  });

  it('считает паллетный тариф умножением на количество паллет', () => {
    const total = service.calculateQuoteTotal(
      {
        label: '2-3 палеты',
        minPallets: 2,
        maxPallets: 3,
        maxBoxes: null,
        pricingMode: LogisticsPricingMode.PER_PALLET,
        priceRub: 6000,
      },
      3,
    );

    expect(total).toBe(18000);
  });

  it('не делает авторасчет для неоднозначных тарифных строк', () => {
    const total = service.calculateQuoteTotal(
      {
        label: 'от 16 до 17 палет',
        minPallets: 16,
        maxPallets: 17,
        maxBoxes: null,
        pricingMode: LogisticsPricingMode.MANUAL_REVIEW,
        priceRub: 25000,
      },
      16,
    );

    expect(total).toBeNull();
  });

  it('возвращает ошибку, когда подходящей ступени нет', () => {
    expect(() => service.selectRateTier([], { boxes: 2 })).toThrow(BadRequestException);
  });
});
