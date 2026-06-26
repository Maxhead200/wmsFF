import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientRequestStatus, ClientRequestType, Prisma, StockBalance, StockStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { PickClientRequestDto } from './dto/pick-client-request.dto';
import { TransferBetweenBoxesDto } from './dto/transfer-between-boxes.dto';
import { StockBalancesService } from './stock-balances.service';

export type ReceiveIntoBoxInput = {
  clientId: string;
  skuId?: string;
  barcode?: string;
  boxCode: string;
  quantity: number;
  status?: StockStatus;
  idempotencyKey: string;
  sourceDocument?: string;
  comment?: string;
};

export type AdjustInventoryInput = {
  clientId: string;
  skuId?: string;
  barcode?: string;
  boxCode: string;
  countedQuantity: number;
  status?: StockStatus;
  idempotencyKey: string;
  comment?: string;
};

@Injectable()
export class StockOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
    private readonly balances: StockBalancesService,
  ) {}

  transferBetweenBoxes(dto: TransferBetweenBoxesDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    return this.prisma.$transaction(async (tx) => {
      const existingMovement = await tx.stockMovement.findUnique({
        where: { idempotencyKey: `${dto.idempotencyKey}:out` },
      });

      if (existingMovement) {
        // Русский комментарий: повтор операции с ТСД возвращаем как уже принятую, чтобы offline retry был безопасным.
        return {
          idempotencyKey: dto.idempotencyKey,
          status: 'ALREADY_APPLIED',
        };
      }

      const sku = await this.resolveSku(tx, dto);
      const fromBox = await this.resolveBox(tx, dto.clientId, dto.fromBoxCode);
      const toBox = await this.ensureTargetBox(tx, dto.clientId, dto.toBoxCode);
      const status = dto.status ?? StockStatus.AVAILABLE;

      const sourceBalance = await tx.stockBalance.findFirst({
        where: {
          clientId: dto.clientId,
          skuId: sku.id,
          boxId: fromBox.id,
          status,
        },
      });

      if (!sourceBalance || sourceBalance.quantity < dto.quantity) {
        throw new BadRequestException('Недостаточно остатка в исходном коробе.');
      }

      await this.decrementSourceBalance(tx, sourceBalance, dto.quantity);
      const targetBalance = await this.incrementTargetBalance(tx, {
        clientId: dto.clientId,
        skuId: sku.id,
        boxId: toBox.id,
        palletId: toBox.palletId,
        status,
        quantity: dto.quantity,
      });

      await tx.stockMovement.create({
        data: {
          clientId: dto.clientId,
          skuId: sku.id,
          boxId: fromBox.id,
          palletId: fromBox.palletId,
          type: 'MOVE',
          status,
          quantity: -dto.quantity,
          idempotencyKey: `${dto.idempotencyKey}:out`,
          comment: dto.comment ?? `Перенос в короб ${toBox.code}`,
        },
      });

      await tx.stockMovement.create({
        data: {
          clientId: dto.clientId,
          skuId: sku.id,
          boxId: toBox.id,
          palletId: toBox.palletId,
          type: 'MOVE',
          status,
          quantity: dto.quantity,
          idempotencyKey: `${dto.idempotencyKey}:in`,
          comment: dto.comment ?? `Перенос из короба ${fromBox.code}`,
        },
      });

      return {
        idempotencyKey: dto.idempotencyKey,
        status: 'APPLIED',
        skuId: sku.id,
        fromBox: fromBox.code,
        toBox: toBox.code,
        quantity: dto.quantity,
        targetBalance,
      };
    });
  }

  pickClientRequest(dto: PickClientRequestDto, user: AuthUser) {
    const baseKey = dto.idempotencyKey ?? `pick-request:${dto.requestId}`;

    return this.prisma.$transaction(async (tx) => {
      const existingMovement = await tx.stockMovement.findFirst({
        where: { idempotencyKey: { startsWith: `${baseKey}:` } },
      });

      if (existingMovement) {
        return {
          idempotencyKey: baseKey,
          status: 'ALREADY_APPLIED',
          requestId: dto.requestId,
        };
      }

      const request = await tx.clientRequest.findUnique({
        where: { id: dto.requestId },
        include: {
          items: true,
        },
      });

      if (!request) {
        throw new NotFoundException('Клиентская заявка не найдена.');
      }

      this.clientScopes.requireClientAccess(user, request.clientId, 'write');

      if (request.type !== ClientRequestType.OUTBOUND) {
        throw new BadRequestException('Сборка доступна только для заявок на отгрузку.');
      }

      if (request.status === ClientRequestStatus.CANCELLED || request.status === ClientRequestStatus.REJECTED) {
        throw new BadRequestException('Нельзя собирать отмененную или отклоненную заявку.');
      }

      if (request.items.length === 0) {
        throw new BadRequestException('В заявке нет товарных позиций для сборки.');
      }

      const plan = await this.planRequestPick(tx, request.clientId, request.items);

      // Русский комментарий: сначала строим полный план по всем строкам, и только потом меняем остатки,
      // чтобы нехватка по одной позиции не оставила заявку частично собранной.
      for (const line of plan.lines) {
        for (const allocation of line.allocations) {
          await this.decrementSourceBalance(tx, allocation.balance, allocation.quantity);
          await this.incrementTargetBalance(tx, {
            clientId: request.clientId,
            skuId: line.skuId,
            boxId: allocation.balance.boxId!,
            palletId: allocation.balance.palletId,
            status: StockStatus.PACKING,
            quantity: allocation.quantity,
          });

          await tx.stockMovement.create({
            data: {
              clientId: request.clientId,
              skuId: line.skuId,
              boxId: allocation.balance.boxId,
              palletId: allocation.balance.palletId,
              type: 'PICK',
              status: StockStatus.AVAILABLE,
              quantity: -allocation.quantity,
              sourceDocument: request.id,
              idempotencyKey: `${baseKey}:${line.itemId}:${allocation.balance.id}:out`,
              comment: dto.comment ?? `Сборка заявки ${request.title}`,
            },
          });

          await tx.stockMovement.create({
            data: {
              clientId: request.clientId,
              skuId: line.skuId,
              boxId: allocation.balance.boxId,
              palletId: allocation.balance.palletId,
              type: 'PICK',
              status: StockStatus.PACKING,
              quantity: allocation.quantity,
              sourceDocument: request.id,
              idempotencyKey: `${baseKey}:${line.itemId}:${allocation.balance.id}:in`,
              comment: dto.comment ?? `Передано в упаковку по заявке ${request.title}`,
            },
          });
        }
      }

      await tx.clientRequest.update({
        where: { id: request.id },
        data: {
          status: ClientRequestStatus.IN_WORK,
          assignedToUserId: user.id,
          managerComment: dto.comment ?? request.managerComment,
        },
      });

      return {
        idempotencyKey: baseKey,
        status: 'APPLIED',
        requestId: request.id,
        clientId: request.clientId,
        pickedLines: plan.lines.map((line) => ({
          itemId: line.itemId,
          skuId: line.skuId,
          requestedQuantity: line.requestedQuantity,
          pickedQuantity: line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0),
          allocations: line.allocations.map((allocation) => ({
            boxId: allocation.balance.boxId,
            palletId: allocation.balance.palletId,
            quantity: allocation.quantity,
          })),
        })),
      };
    });
  }

  receiveIntoBox(dto: ReceiveIntoBoxInput, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    return this.prisma.$transaction(async (tx) => {
      const existingMovement = await tx.stockMovement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });

      if (existingMovement) {
        // Русский комментарий: повтор receipt_scan с тем же ключом не создает второй приход.
        return {
          idempotencyKey: dto.idempotencyKey,
          status: 'ALREADY_APPLIED',
        };
      }

      const sku = await this.resolveSku(tx, dto);
      const box = await this.ensureTargetBox(tx, dto.clientId, dto.boxCode);
      const status = dto.status ?? StockStatus.RECEIVING;

      const targetBalance = await this.incrementTargetBalance(tx, {
        clientId: dto.clientId,
        skuId: sku.id,
        boxId: box.id,
        palletId: box.palletId,
        status,
        quantity: dto.quantity,
      });

      await tx.stockMovement.create({
        data: {
          clientId: dto.clientId,
          skuId: sku.id,
          boxId: box.id,
          palletId: box.palletId,
          type: 'RECEIPT',
          status,
          quantity: dto.quantity,
          sourceDocument: dto.sourceDocument,
          idempotencyKey: dto.idempotencyKey,
          comment: dto.comment ?? `Приемка ТСД в короб ${box.code}`,
        },
      });

      return {
        idempotencyKey: dto.idempotencyKey,
        status: 'APPLIED',
        skuId: sku.id,
        box: box.code,
        quantity: dto.quantity,
        targetBalance,
      };
    });
  }

  adjustInventoryToCounted(dto: AdjustInventoryInput, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    return this.prisma.$transaction(async (tx) => {
      const existingMovement = await tx.stockMovement.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });

      if (existingMovement) {
        // Русский комментарий: повтор подтверждения разбора ТСД не создает вторую корректировку.
        return {
          idempotencyKey: dto.idempotencyKey,
          status: 'ALREADY_APPLIED',
        };
      }

      const sku = await this.resolveSku(tx, dto);
      const box = await this.resolveBox(tx, dto.clientId, dto.boxCode);
      const status = dto.status ?? StockStatus.AVAILABLE;
      const balance = await tx.stockBalance.findFirst({
        where: {
          clientId: dto.clientId,
          skuId: sku.id,
          boxId: box.id,
          status,
        },
      });
      const currentQuantity = balance?.quantity ?? 0;
      const delta = dto.countedQuantity - currentQuantity;

      if (delta > 0) {
        await this.incrementTargetBalance(tx, {
          clientId: dto.clientId,
          skuId: sku.id,
          boxId: box.id,
          palletId: box.palletId,
          status,
          quantity: delta,
        });
      }

      if (delta < 0 && balance) {
        await this.decrementSourceBalance(tx, balance, Math.abs(delta));
      }

      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            clientId: dto.clientId,
            skuId: sku.id,
            boxId: box.id,
            palletId: box.palletId,
            type: 'INVENTORY_ADJUSTMENT',
            status,
            quantity: delta,
            idempotencyKey: dto.idempotencyKey,
            comment: dto.comment ?? `Корректировка инвентаризации ТСД в коробе ${box.code}`,
          },
        });
      }

      return {
        idempotencyKey: dto.idempotencyKey,
        status: delta === 0 ? 'NO_CHANGE' : 'APPLIED',
        skuId: sku.id,
        box: box.code,
        previousQuantity: currentQuantity,
        countedQuantity: dto.countedQuantity,
        delta,
      };
    });
  }

  planTransferQuantities(sourceQuantity: number, targetQuantity: number, requestedQuantity: number) {
    if (requestedQuantity <= 0) {
      throw new BadRequestException('Количество должно быть больше нуля.');
    }

    if (sourceQuantity < requestedQuantity) {
      throw new BadRequestException('Недостаточно остатка в исходном коробе.');
    }

    return {
      sourceQuantity: sourceQuantity - requestedQuantity,
      targetQuantity: targetQuantity + requestedQuantity,
    };
  }

  private async planRequestPick(
    tx: Prisma.TransactionClient,
    clientId: string,
    items: Array<{ id: string; skuId: string | null; barcode: string | null; quantity: number }>,
  ) {
    const lines = [];

    for (const item of items) {
      const sku = await this.resolveSku(tx, {
        clientId,
        skuId: item.skuId ?? undefined,
        barcode: item.barcode ?? undefined,
      });
      const balances = await tx.stockBalance.findMany({
        where: {
          clientId,
          skuId: sku.id,
          status: StockStatus.AVAILABLE,
          quantity: { gt: 0 },
          boxId: { not: null },
        },
        orderBy: [{ updatedAt: 'asc' }],
      });
      let remaining = item.quantity;
      const allocations: Array<{ balance: StockBalance; quantity: number }> = [];

      for (const balance of balances) {
        if (remaining <= 0) {
          break;
        }

        const quantity = Math.min(balance.quantity, remaining);
        allocations.push({ balance, quantity });
        remaining -= quantity;
      }

      if (remaining > 0) {
        throw new BadRequestException(`Недостаточно доступного остатка для позиции ${sku.internalSku}.`);
      }

      lines.push({
        itemId: item.id,
        skuId: sku.id,
        requestedQuantity: item.quantity,
        allocations,
      });
    }

    return { lines };
  }

  private async resolveSku(tx: Prisma.TransactionClient, dto: { clientId: string; skuId?: string; barcode?: string }) {
    if (dto.skuId) {
      const sku = await tx.sku.findFirst({ where: { id: dto.skuId, clientId: dto.clientId } });
      if (!sku) {
        throw new NotFoundException('SKU не найден у клиента.');
      }
      return sku;
    }

    if (!dto.barcode) {
      throw new BadRequestException('Для складской операции нужен SKU или штрихкод.');
    }

    const barcode = await tx.barcode.findFirst({
      where: {
        value: dto.barcode,
        sku: { clientId: dto.clientId },
      },
      include: { sku: true },
    });

    if (!barcode) {
      throw new NotFoundException('Штрихкод не найден у клиента.');
    }

    return barcode.sku;
  }

  private async resolveBox(tx: Prisma.TransactionClient, clientId: string, code: string) {
    const box = await tx.box.findUnique({
      where: { clientId_code: { clientId, code } },
    });

    if (!box) {
      throw new NotFoundException(`Короб ${code} не найден.`);
    }

    return box;
  }

  private ensureTargetBox(tx: Prisma.TransactionClient, clientId: string, code: string) {
    return tx.box.upsert({
      where: { clientId_code: { clientId, code } },
      update: {},
      create: { clientId, code },
    });
  }

  private async decrementSourceBalance(tx: Prisma.TransactionClient, balance: StockBalance, quantity: number) {
    if (balance.quantity === quantity) {
      await tx.stockBalance.delete({ where: { id: balance.id } });
      return;
    }

    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: { decrement: quantity } },
    });
  }

  private incrementTargetBalance(
    tx: Prisma.TransactionClient,
    input: {
      clientId: string;
      skuId: string;
      boxId: string;
      palletId?: string | null;
      status: StockStatus;
      quantity: number;
    },
  ) {
    const balanceKey = this.balances.balanceKey(input);

    return tx.stockBalance.upsert({
      where: { balanceKey },
      update: {
        quantity: { increment: input.quantity },
      },
      create: {
        balanceKey,
        clientId: input.clientId,
        skuId: input.skuId,
        boxId: input.boxId,
        palletId: input.palletId,
        status: input.status,
        quantity: input.quantity,
      },
    });
  }
}
