import { Injectable } from '@nestjs/common';
import { ClientRequestStatus, Prisma, StockStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { ListStockBalancesDto } from './dto/list-stock-balances.dto';

export type BalanceKeyInput = {
  clientId: string;
  skuId: string;
  boxId?: string | null;
  palletId?: string | null;
  status: StockStatus;
};

const stockBalanceListInclude = {
  sku: { include: { barcodes: true } },
  box: true,
  pallet: true,
} satisfies Prisma.StockBalanceInclude;

type StockBalanceListRow = Prisma.StockBalanceGetPayload<{ include: typeof stockBalanceListInclude }>;

@Injectable()
export class StockBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  async list(filter: ListStockBalancesDto, user: AuthUser) {
    const search = filter.search?.trim();
    const skuWhere: Prisma.SkuWhereInput | undefined =
      filter.barcode || search
        ? {
            ...(filter.barcode ? { barcodes: { some: { value: filter.barcode } } } : {}),
            ...(search
              ? {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { internalSku: { contains: search, mode: 'insensitive' } },
                    { clientSku: { contains: search, mode: 'insensitive' } },
                    { article: { contains: search, mode: 'insensitive' } },
                    { barcodes: { some: { value: { contains: search } } } },
                  ],
                }
              : {}),
          }
        : undefined;
    const where: Prisma.StockBalanceWhereInput = {
      clientId: this.clientScopes.resolveClientFilter(user, filter.clientId),
      skuId: filter.skuId,
      box: filter.boxCode ? { code: filter.boxCode } : undefined,
      sku: skuWhere,
    };

    const balances = await this.prisma.stockBalance.findMany({
      where,
      include: stockBalanceListInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: search ? 100 : undefined,
    });

    return this.withInWorkReservations(balances);
  }

  balanceKey(input: BalanceKeyInput) {
    // Русский комментарий: отдельный ключ убирает неоднозначность SQL NULL в составных unique-индексах.
    return [input.clientId, input.skuId, input.boxId ?? 'no-box', input.palletId ?? 'no-pallet', input.status].join(':');
  }

  private async withInWorkReservations(balances: StockBalanceListRow[]) {
    const clientIds = [...new Set(balances.map((balance) => balance.clientId))];
    const skuIds = [...new Set(balances.map((balance) => balance.skuId))];

    if (clientIds.length === 0 || skuIds.length === 0) {
      return balances.map((balance) => ({
        ...balance,
        reservedQuantity: 0,
        availableQuantity: Number(balance.quantity),
        inWorkRequests: [],
      }));
    }

    const requestItems = await this.prisma.clientRequestItem.findMany({
      where: {
        skuId: { in: skuIds },
        request: {
          clientId: { in: clientIds },
          status: ClientRequestStatus.IN_WORK,
        },
      },
      select: {
        skuId: true,
        quantity: true,
        request: {
          select: {
            id: true,
            title: true,
            status: true,
            destinationCity: true,
            createdAt: true,
            clientId: true,
          },
        },
      },
    });

    const reservations = new Map<
      string,
      {
        quantity: number;
        requests: Map<string, { id: string; title: string; status: ClientRequestStatus; destinationCity: string | null; createdAt: Date; quantity: number }>;
      }
    >();

    requestItems.forEach((item) => {
      if (!item.skuId) {
        return;
      }

      const key = reservationKey(item.request.clientId, item.skuId);
      const reservation = reservations.get(key) ?? { quantity: 0, requests: new Map() };
      reservation.quantity += item.quantity;

      const existingRequest = reservation.requests.get(item.request.id);
      reservation.requests.set(item.request.id, {
        id: item.request.id,
        title: item.request.title,
        status: item.request.status,
        destinationCity: item.request.destinationCity,
        createdAt: item.request.createdAt,
        quantity: (existingRequest?.quantity ?? 0) + item.quantity,
      });
      reservations.set(key, reservation);
    });

    const remainingByKey = new Map([...reservations.entries()].map(([key, reservation]) => [key, reservation.quantity]));

    return balances.map((balance) => {
      const key = reservationKey(balance.clientId, balance.skuId);
      const physicalQuantity = Number(balance.quantity);
      if (balance.status !== StockStatus.AVAILABLE) {
        return {
          ...balance,
          reservedQuantity: 0,
          availableQuantity: physicalQuantity,
          inWorkRequests: [],
        };
      }
      const remaining = remainingByKey.get(key) ?? 0;
      const reservedQuantity = Math.min(physicalQuantity, Math.max(0, remaining));
      remainingByKey.set(key, Math.max(0, remaining - reservedQuantity));

      return {
        ...balance,
        reservedQuantity,
        availableQuantity: Math.max(0, physicalQuantity - reservedQuantity),
        inWorkRequests: [...(reservations.get(key)?.requests.values() ?? [])].sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        ),
      };
    });
  }
}

function reservationKey(clientId: string, skuId: string) {
  return `${clientId}:${skuId}`;
}
