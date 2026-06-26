import { BadRequestException } from '@nestjs/common';
import {
  BillingChargeSource,
  BillingChargeStatus,
  BillingInvoiceStatus,
  BillingUnit,
  ClientNotificationEvent,
} from '@prisma/client';
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

  it('создает автоматическое начисление хранения по литражу', async () => {
    const prisma = {
      billingService: {
        upsert: vi.fn().mockResolvedValue({
          id: 'service-storage',
          code: 'STORAGE_LITER_DAY',
          defaultPriceRub: null,
        }),
      },
      billingCharge: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'charge-storage' }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          {
            quantity: 2,
            sku: { volumeLiters: '1.500' },
          },
          {
            quantity: 3,
            sku: { volumeLiters: '2.000' },
          },
          {
            quantity: 1,
            sku: { volumeLiters: null },
          },
        ]),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.generateStorageCharge(
      {
        clientId: 'client-1',
        periodFrom: '2026-06-01',
        periodTo: '2026-06-03',
        unitPriceRub: 0.5,
        approve: true,
      },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(prisma.stockBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'client-1',
          quantity: { gt: 0 },
        }),
      }),
    );
    expect(prisma.billingCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          serviceId: 'service-storage',
          unit: BillingUnit.LITER_DAY,
          quantity: 27,
          unitPriceRub: 0.5,
          totalRub: 13.5,
          status: BillingChargeStatus.APPROVED,
          source: BillingChargeSource.STORAGE,
          sourceKey: 'storage:client-1:2026-06-01:2026-06-03',
          approvedByUserId: 'user-1',
          metadata: expect.objectContaining({
            days: 3,
            totalLiters: 9,
            literDays: 27,
            balancesCount: 3,
            skippedWithoutVolume: 1,
          }),
        }),
      }),
    );
  });

  it('не дублирует автоматическое хранение за тот же период', async () => {
    const prisma = {
      billingCharge: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-storage' }),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await expect(
      service.generateStorageCharge(
        {
          clientId: 'client-1',
          periodFrom: '2026-06-01',
          periodTo: '2026-06-03',
          unitPriceRub: 0.5,
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

  it('создает клиентское уведомление при смене статуса счета', async () => {
    const tx = {
      billingInvoice: {
        update: vi.fn().mockResolvedValue({ id: 'invoice-1', status: BillingInvoiceStatus.ISSUED }),
      },
      clientNotificationPreference: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      clientNotification: {
        create: vi.fn().mockResolvedValue({ id: 'notification-1' }),
      },
    };
    const prisma = {
      billingInvoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'invoice-1',
          number: 'INV-202606-0001',
          clientId: 'client-1',
          totalRub: '100.00',
          paidRub: '0.00',
          status: BillingInvoiceStatus.DRAFT,
          issuedAt: null,
          paidAt: null,
        }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.updateInvoiceStatus(
      'invoice-1',
      { status: BillingInvoiceStatus.ISSUED },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(tx.clientNotificationPreference.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId_eventType: {
            clientId: 'client-1',
            eventType: ClientNotificationEvent.BILLING_INVOICE_STATUS_CHANGED,
          },
        },
      }),
    );
    expect(tx.clientNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          title: 'Статус счета изменен',
          body: 'Счет № INV-202606-0001: черновик -> выставлен',
          severity: 'INFO',
        }),
      }),
    );
  });

  it('принимает оплату и закрывает счет при полной сумме', async () => {
    const prisma = {
      billingInvoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'invoice-1',
          number: 'INV-1',
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
      clientNotificationPreference: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      clientNotification: {
        create: vi.fn().mockResolvedValue({ id: 'notification-1' }),
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
    expect(prisma.clientNotificationPreference.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId_eventType: {
            clientId: 'client-1',
            eventType: ClientNotificationEvent.BILLING_PAYMENT_RECORDED,
          },
        },
      }),
    );
    expect(prisma.clientNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          title: 'Оплата по счету принята',
          severity: 'SUCCESS',
        }),
      }),
    );
  });

  it('собирает сверку задолженности по доступным счетам клиента', async () => {
    const prisma = {
      billingInvoice: {
        findMany: vi.fn().mockResolvedValue([
          billingInvoice({
            id: 'invoice-overdue',
            number: 'INV-202606-0001',
            totalRub: '1000.00',
            paidRub: '250.00',
            dueDate: new Date('2020-06-01T23:59:59.999Z'),
            status: BillingInvoiceStatus.ISSUED,
          }),
          billingInvoice({
            id: 'invoice-paid',
            number: 'INV-202606-0002',
            totalRub: '300.00',
            paidRub: '300.00',
            dueDate: new Date('2026-06-20T23:59:59.999Z'),
            status: BillingInvoiceStatus.PAID,
            paidAt: new Date('2026-06-18T00:00:00.000Z'),
          }),
        ]),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    const report = await service.listReconciliation(
      { periodFrom: '2026-06-01', periodTo: '2026-06-30' },
      user({ clientIds: ['client-1'] }),
    );

    expect(prisma.billingInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ['client-1'] },
          status: { not: BillingInvoiceStatus.CANCELLED },
          periodFrom: expect.objectContaining({ gte: expect.any(Date) }),
          periodTo: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
    expect(report.totals).toMatchObject({
      invoicesCount: 2,
      paidInvoicesCount: 1,
      openInvoicesCount: 1,
      overdueInvoicesCount: 1,
      totalRub: 1300,
      paidRub: 550,
      debtRub: 750,
      overdueRub: 750,
    });
    expect(report.clients[0]).toMatchObject({
      client: { id: 'client-1', code: 'CLIENT', name: 'Client' },
      debtRub: 750,
      overdueRub: 750,
      nearestDueDate: '2020-06-01T23:59:59.999Z',
    });
    expect(report.clients[0].invoices[0]).toMatchObject({
      number: 'INV-202606-0001',
      remainingRub: 750,
      overdueDays: expect.any(Number),
    });
  });

  it('groups client service history by service and source', async () => {
    const prisma = {
      billingCharge: {
        findMany: vi.fn().mockResolvedValue([
          billingCharge({
            id: 'charge-1',
            serviceId: 'service-1',
            description: 'Приемка коробов',
            quantity: '2',
            totalRub: '200',
            status: BillingChargeStatus.APPROVED,
            serviceDate: new Date('2026-06-20T00:00:00.000Z'),
            service: {
              id: 'service-1',
              code: 'RECEIVING',
              name: 'Приемка коробов',
              unit: BillingUnit.BOX,
            },
          }),
          billingCharge({
            id: 'charge-2',
            serviceId: 'service-1',
            description: 'Приемка коробов',
            quantity: '3',
            totalRub: '300',
            status: BillingChargeStatus.DRAFT,
            serviceDate: new Date('2026-06-21T00:00:00.000Z'),
            service: {
              id: 'service-1',
              code: 'RECEIVING',
              name: 'Приемка коробов',
              unit: BillingUnit.BOX,
            },
          }),
        ]),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    const history = await service.listServiceHistory(
      { clientId: 'client-1', periodFrom: '2026-06-01', periodTo: '2026-06-30' },
      user({ clientIds: ['client-1'] }),
    );

    expect(prisma.billingCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'client-1',
          serviceDate: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
    expect(history.totals).toMatchObject({
      chargesCount: 2,
      totalRub: 500,
      approvedRub: 200,
      draftRub: 300,
    });
    expect(history.groups).toHaveLength(1);
    expect(history.groups[0]).toMatchObject({
      serviceCode: 'RECEIVING',
      serviceName: 'Приемка коробов',
      chargesCount: 2,
      quantity: 5,
      totalRub: 500,
      latestStatus: BillingChargeStatus.DRAFT,
    });
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

function billingCharge(overrides: Record<string, unknown>) {
  return {
    id: 'charge',
    clientId: 'client-1',
    serviceId: null,
    requestId: null,
    description: 'Услуга',
    unit: BillingUnit.SERVICE,
    quantity: '1',
    unitPriceRub: '100',
    totalRub: '100',
    status: BillingChargeStatus.DRAFT,
    serviceDate: new Date('2026-06-20T00:00:00.000Z'),
    source: BillingChargeSource.MANUAL,
    sourceKey: null,
    metadata: null,
    comment: null,
    approvedAt: null,
    createdAt: new Date('2026-06-20T00:00:00.000Z'),
    updatedAt: new Date('2026-06-20T00:00:00.000Z'),
    client: { id: 'client-1', code: 'CLIENT', name: 'Client' },
    service: null,
    request: null,
    createdBy: null,
    approvedBy: null,
    ...overrides,
  };
}

function billingInvoice(overrides: Record<string, unknown>) {
  return {
    id: 'invoice-1',
    number: 'INV-202606-0001',
    clientId: 'client-1',
    periodFrom: new Date('2026-06-01T00:00:00.000Z'),
    periodTo: new Date('2026-06-30T23:59:59.999Z'),
    dueDate: new Date('2026-06-15T23:59:59.999Z'),
    status: BillingInvoiceStatus.ISSUED,
    totalRub: '100.00',
    paidRub: '0.00',
    issuedAt: new Date('2026-06-10T00:00:00.000Z'),
    paidAt: null,
    comment: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-06-10T00:00:00.000Z'),
    updatedAt: new Date('2026-06-10T00:00:00.000Z'),
    client: { id: 'client-1', code: 'CLIENT', name: 'Client' },
    ...overrides,
  };
}
