import { BadRequestException } from '@nestjs/common';
import { BillingChargeSource, BillingChargeStatus, BillingUnit, LogisticsDeliveryStatus, LogisticsPricingMode } from '@prisma/client';
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
  it('финализирует ручной расчет доставки', async () => {
    const prisma = {
      logisticsDeliveryRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'delivery-1',
          clientId: 'client-1',
          status: LogisticsDeliveryStatus.REQUESTED,
          billingChargeId: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: 'delivery-1',
          estimatedTotalRub: '8200.00',
          requiresManualReview: false,
          status: LogisticsDeliveryStatus.QUOTED,
        }),
      },
    };
    const deliveryService = new LogisticsService(prisma as never, { requireClientAccess: vi.fn() } as never);

    await deliveryService.finalizeDeliveryQuote(
      'delivery-1',
      {
        estimatedTotalRub: 8200,
        managerComment: 'финальный расчет',
      },
      user(),
    );

    expect(prisma.logisticsDeliveryRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({
          estimatedTotalRub: 8200,
          requiresManualReview: false,
          status: LogisticsDeliveryStatus.QUOTED,
          managerComment: 'финальный расчет',
        }),
      }),
    );
  });

  it('создает начисление биллинга по доставленной заявке', async () => {
    const tx = {
      billingService: {
        upsert: vi.fn().mockResolvedValue({ id: 'service-delivery' }),
      },
      billingCharge: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'charge-delivery' }),
      },
      logisticsDeliveryRequest: {
        update: vi.fn().mockResolvedValue({ id: 'delivery-1', billingChargeId: 'charge-delivery' }),
      },
    };
    const prisma = {
      logisticsDeliveryRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'delivery-1',
          clientId: 'client-1',
          requestId: 'request-1',
          tariffSetId: 'tariff-1',
          billingChargeId: null,
          origin: 'Москва',
          destination: 'Казань',
          boxes: 4,
          pallets: null,
          desiredShipDate: new Date('2026-06-20T00:00:00.000Z'),
          plannedShipDate: null,
          status: LogisticsDeliveryStatus.DELIVERED,
          estimatedTotalRub: '7500.00',
          requiresManualReview: false,
          comment: 'доставка клиента',
          managerComment: null,
          client: { id: 'client-1', code: 'CL-1', name: 'Client' },
          request: { id: 'request-1', title: 'Заявка' },
          tariffSet: { id: 'tariff-1', name: 'Тариф' },
          billingCharge: null,
        }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const deliveryService = new LogisticsService(prisma as never, { requireClientAccess: vi.fn() } as never);

    await deliveryService.generateDeliveryBillingCharge('delivery-1', user());

    expect(tx.billingCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          requestId: 'request-1',
          serviceId: 'service-delivery',
          description: 'Доставка Москва -> Казань',
          unit: BillingUnit.SERVICE,
          quantity: 1,
          unitPriceRub: 7500,
          totalRub: 7500,
          status: BillingChargeStatus.APPROVED,
          source: BillingChargeSource.LOGISTICS,
          sourceKey: 'logistics-delivery:delivery-1',
          createdByUserId: 'user-1',
          approvedByUserId: 'user-1',
          metadata: expect.objectContaining({
            deliveryRequestId: 'delivery-1',
            boxes: 4,
            tariffSetId: 'tariff-1',
          }),
        }),
      }),
    );
    expect(tx.logisticsDeliveryRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'delivery-1' },
        data: { billingChargeId: 'charge-delivery' },
      }),
    );
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
