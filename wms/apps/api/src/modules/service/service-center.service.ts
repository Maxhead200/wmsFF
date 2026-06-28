import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthUser } from '../auth/auth.types';

const CLEANUP_CONFIRMATION = 'ОЧИСТИТЬ';

@Injectable()
export class ServiceCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getClientStockCleanupPreview(clientId: string) {
    const client = await this.findClient(clientId);
    const summary = await this.getClientStockSummary(clientId);

    return {
      client,
      summary,
      confirmationText: CLEANUP_CONFIRMATION,
      warning:
        'Будут удалены остатки, движения склада, КИЗы, короба и паллеты выбранного клиента. Клиент, пользователи, SKU, каталог и API маркетплейсов останутся.',
    };
  }

  async purgeClientStock(clientId: string, confirmation: string | undefined, user: AuthUser) {
    if (confirmation !== CLEANUP_CONFIRMATION) {
      throw new BadRequestException(`Для очистки введите подтверждение: ${CLEANUP_CONFIRMATION}.`);
    }

    const client = await this.findClient(clientId);
    const before = await this.getClientStockSummary(clientId);

    const deleted = await this.prisma.$transaction(async (tx) => {
      const productMarks = await tx.productMark.deleteMany({ where: { clientId } });
      const balances = await tx.stockBalance.deleteMany({ where: { clientId } });
      const movements = await tx.stockMovement.deleteMany({ where: { clientId } });
      const boxes = await tx.box.deleteMany({ where: { clientId } });
      const pallets = await tx.pallet.deleteMany({ where: { clientId } });

      return {
        productMarks: productMarks.count,
        balances: balances.count,
        movements: movements.count,
        boxes: boxes.count,
        pallets: pallets.count,
      };
    });

    await this.auditLog.write({
      userId: user.id,
      action: 'service.client-stock.purge',
      entity: 'client',
      entityId: clientId,
      payload: {
        clientCode: client.code,
        clientName: client.name,
        before,
        deleted,
      },
    });

    return {
      client,
      before,
      deleted,
      after: await this.getClientStockSummary(clientId),
    };
  }

  private async findClient(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });

    if (!client) {
      throw new NotFoundException('Клиент не найден.');
    }

    return client;
  }

  private async getClientStockSummary(clientId: string) {
    const [balances, movements, boxes, pallets, productMarks, skuRows] = await Promise.all([
      this.prisma.stockBalance.aggregate({
        where: { clientId },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.count({ where: { clientId } }),
      this.prisma.box.count({ where: { clientId } }),
      this.prisma.pallet.count({ where: { clientId } }),
      this.prisma.productMark.count({ where: { clientId } }),
      this.prisma.stockBalance.groupBy({
        by: ['skuId'],
        where: { clientId },
      }),
    ]);

    return {
      balanceRows: balances._count._all,
      quantity: balances._sum.quantity ?? 0,
      uniqueSkusInStock: skuRows.length,
      movements,
      boxes,
      pallets,
      productMarks,
    };
  }
}
