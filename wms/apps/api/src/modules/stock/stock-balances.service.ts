import { Injectable } from '@nestjs/common';
import { Prisma, StockStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListStockBalancesDto } from './dto/list-stock-balances.dto';

export type BalanceKeyInput = {
  clientId: string;
  skuId: string;
  boxId?: string | null;
  palletId?: string | null;
  status: StockStatus;
};

@Injectable()
export class StockBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: ListStockBalancesDto) {
    const where: Prisma.StockBalanceWhereInput = {
      clientId: filter.clientId,
      skuId: filter.skuId,
      box: filter.boxCode ? { code: filter.boxCode } : undefined,
      sku: filter.barcode ? { barcodes: { some: { value: filter.barcode } } } : undefined,
    };

    return this.prisma.stockBalance.findMany({
      where,
      include: {
        sku: { include: { barcodes: true } },
        box: true,
        pallet: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });
  }

  balanceKey(input: BalanceKeyInput) {
    // Русский комментарий: отдельный ключ убирает неоднозначность SQL NULL в составных unique-индексах.
    return [input.clientId, input.skuId, input.boxId ?? 'no-box', input.palletId ?? 'no-pallet', input.status].join(':');
  }
}
