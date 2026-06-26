import { BadRequestException } from '@nestjs/common';
import { LogisticsPricingMode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { LogisticsService } from '../src/modules/logistics/logistics.service';

describe('LogisticsService', () => {
  const service = new LogisticsService({} as never, {} as never);

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

  it('создает заявку на доставку с автоматическим расчетом тарифа', async () => {
    const prisma = {
      clientRequest: {
        findFirst: vi.fn().mockResolvedValue({ id: 'request-1' }),
      },
      logisticsTariffSet: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'tariff-1',
          name: 'Тариф',
          sourceFile: null,
        }),
      },
      logisticsDirection: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'direction-1',
            tariffSetId: 'tariff-1',
            origin: 'МОСКВА',
            destination: 'КАЗАНЬ',
            note: null,
            tiers: [
              {
                label: 'до 10 коробов',
                minPallets: null,
                maxPallets: null,
                maxBoxes: 10,
                pricingMode: LogisticsPricingMode.TOTAL,
                priceRub: 5000,
              },
            ],
          },
        ]),
      },
      logisticsDeliveryRequest: {
        create: vi.fn().mockResolvedValue({ id: 'delivery-1' }),
      },
    };
    const deliveryService = new LogisticsService(prisma as never, { requireClientAccess: vi.fn() } as never);

    await deliveryService.createDeliveryRequest(
      {
        clientId: 'client-1',
        requestId: 'request-1',
        tariffSetId: 'tariff-1',
        origin: 'МОСКВА',
        destination: 'КАЗАНЬ',
        boxes: 4,
      },
      user(),
    );

    expect(prisma.logisticsDeliveryRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          requestId: 'request-1',
          status: 'QUOTED',
          estimatedTotalRub: 5000,
          requiresManualReview: false,
          createdByUserId: 'user-1',
        }),
      }),
    );
  });

  it('не разрешает привязать доставку к заявке другого клиента', async () => {
    const prisma = {
      clientRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const deliveryService = new LogisticsService(prisma as never, { requireClientAccess: vi.fn() } as never);

    await expect(
      deliveryService.createDeliveryRequest(
        {
          clientId: 'client-1',
          requestId: 'foreign-request',
          origin: 'МОСКВА',
          destination: 'КАЗАНЬ',
          boxes: 4,
        },
        user(),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

function user(): AuthUser {
  return {
    id: 'user-1',
    email: 'manager@example.com',
    name: 'Manager',
    roleCodes: ['MANAGER'],
    permissionCodes: ['logistics:read', 'logistics:request'],
    clientScopeMode: 'ALL',
    clientIds: [],
    writableClientIds: [],
  };
}
