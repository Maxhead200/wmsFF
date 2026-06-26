import { BadRequestException } from '@nestjs/common';
import { BillingChargeStatus, BillingInvoiceStatus, BillingUnit } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { BillingService } from '../src/modules/billing/billing.service';

describe('BillingService', () => {
  it('фильтрует начисления по доступным клиентам пользователя', async () => {
    const prisma = {
      billingCharge: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.listCharges({}, user({ clientIds: ['client-1'] }));

    expect(prisma.billingCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ['client-1'] },
        }),
      }),
    );
  });

  it('создает начисление по услуге и считает сумму', async () => {
    const prisma = {
      billingService: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'service-1',
          name: 'Приемка коробов',
          unit: BillingUnit.BOX,
          defaultPriceRub: '12.50',
        }),
      },
      clientRequest: {
        findFirst: vi.fn().mockResolvedValue({ id: 'request-1' }),
      },
      billingCharge: {
        create: vi.fn().mockResolvedValue({ id: 'charge-1' }),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.createCharge(
      {
        clientId: 'client-1',
        serviceId: 'service-1',
        requestId: 'request-1',
        quantity: 4,
      },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(prisma.billingCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          description: 'Приемка коробов',
          unit: BillingUnit.BOX,
          unitPriceRub: 12.5,
          totalRub: 50,
          createdByUserId: 'user-1',
        }),
      }),
    );
  });

  it('запрещает привязать начисление к заявке другого клиента', async () => {
    const prisma = {
      billingService: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      clientRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await expect(
      service.createCharge(
        {
          clientId: 'client-1',
          requestId: 'foreign-request',
          description: 'Ручная услуга',
          quantity: 1,
          unitPriceRub: 100,
        },
        user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('утверждает начисление и фиксирует ответственного', async () => {
    const prisma = {
      billingCharge: {
        findUnique: vi.fn().mockResolvedValue({ id: 'charge-1', clientId: 'client-1' }),
        update: vi.fn().mockResolvedValue({ id: 'charge-1', status: BillingChargeStatus.APPROVED }),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.updateChargeStatus(
      'charge-1',
      { status: BillingChargeStatus.APPROVED },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(prisma.billingCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BillingChargeStatus.APPROVED,
          approvedByUserId: 'user-1',
          approvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('создает счет из утвержденных начислений периода', async () => {
    const prisma = {
      billingCharge: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'charge-1',
            description: 'Хранение',
            unit: BillingUnit.LITER,
            quantity: '10',
            unitPriceRub: '2.00',
            totalRub: '20.00',
            serviceDate: new Date('2026-06-10T00:00:00.000Z'),
          },
          {
            id: 'charge-2',
            description: 'Приемка',
            unit: BillingUnit.BOX,
            quantity: '3',
            unitPriceRub: '15.00',
            totalRub: '45.00',
            serviceDate: new Date('2026-06-12T00:00:00.000Z'),
          },
        ]),
      },
      billingInvoice: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 'invoice-1', number: 'INV-202606-0001' }),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.createInvoice(
      {
        clientId: 'client-1',
        periodFrom: '2026-06-01',
        periodTo: '2026-06-30',
      },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(prisma.billingCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'client-1',
          status: BillingChargeStatus.APPROVED,
          invoiceItems: expect.objectContaining({
            none: expect.any(Object),
          }),
        }),
      }),
    );
    expect(prisma.billingInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: 'INV-202606-0001',
          totalRub: 65,
          createdByUserId: 'user-1',
          items: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ chargeId: 'charge-1', totalRub: '20.00' }),
              expect.objectContaining({ chargeId: 'charge-2', totalRub: '45.00' }),
            ]),
          }),
        }),
      }),
    );
  });

  it('не создает счет без доступных утвержденных начислений', async () => {
    const prisma = {
      billingCharge: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await expect(
      service.createInvoice(
        {
          clientId: 'client-1',
          periodFrom: '2026-06-01',
          periodTo: '2026-06-30',
        },
        user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('запрещает закрыть счет как оплаченный при неполной оплате', async () => {
    const prisma = {
      billingInvoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'invoice-1',
          clientId: 'client-1',
          totalRub: '100.00',
          paidRub: '40.00',
          status: BillingInvoiceStatus.ISSUED,
          issuedAt: new Date('2026-06-15T00:00:00.000Z'),
          paidAt: null,
        }),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await expect(
      service.updateInvoiceStatus(
        'invoice-1',
        { status: BillingInvoiceStatus.PAID },
        user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('принимает оплату и закрывает счет при полной сумме', async () => {
    const prisma = {
      billingInvoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'invoice-1',
          clientId: 'client-1',
          status: BillingInvoiceStatus.ISSUED,
          totalRub: '100.00',
          paidRub: '40.00',
          issuedAt: new Date('2026-06-15T00:00:00.000Z'),
        }),
        update: vi.fn().mockResolvedValue({ id: 'invoice-1', status: BillingInvoiceStatus.PAID }),
      },
      billingPayment: {
        create: vi.fn().mockResolvedValue({ id: 'payment-1' }),
      },
      $transaction: vi.fn((callback) => callback(prisma)),
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.createPayment(
      {
        invoiceId: 'invoice-1',
        amountRub: 60,
        paidAt: '2026-06-20',
        method: 'bank',
      },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(prisma.billingPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 'invoice-1',
          clientId: 'client-1',
          amountRub: 60,
          method: 'bank',
          createdByUserId: 'user-1',
        }),
      }),
    );
    expect(prisma.billingInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidRub: 100,
          status: BillingInvoiceStatus.PAID,
          paidAt: expect.any(Date),
        }),
      }),
    );
  });
});

function clientScopes() {
  return {
    resolveClientFilter: (user: AuthUser, requestedClientId?: string) =>
      requestedClientId ?? (user.clientScopeMode === 'ALL' ? undefined : { in: user.clientIds }),
    requireClientAccess: vi.fn(),
    requireGlobalClientAccess: vi.fn(),
  } as never;
}

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'manager@example.com',
    name: 'Manager',
    roleCodes: ['MANAGER'],
    permissionCodes: ['billing:read', 'billing:write'],
    clientScopeMode: 'LIMITED',
    clientIds: [],
    writableClientIds: [],
    ...overrides,
  };
}
