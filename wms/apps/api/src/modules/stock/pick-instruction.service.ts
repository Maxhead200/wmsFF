import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientRequestType, Prisma, StockStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import {
  renderPickInstructionHtml,
  requestPriorityLabel,
  requestStatusLabel,
  rowStatusLabel,
  safeFileName,
} from './pick-instruction-renderer';
import type {
  PickInstructionAllocation,
  PickInstructionBoxSummary,
  PickInstructionDocument,
  PickInstructionRow,
  PickInstructionRowStatus,
} from './pick-instruction.types';

type RequestForInstruction = Prisma.ClientRequestGetPayload<typeof pickInstructionRequestArgs>;
type RequestItemForInstruction = RequestForInstruction['items'][number];
type SkuForInstruction = NonNullable<RequestItemForInstruction['sku']>;
type BalanceForInstruction = Prisma.StockBalanceGetPayload<typeof stockBalanceArgs>;

@Injectable()
export class PickInstructionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  async getRequestInstruction(requestId: string, user: AuthUser) {
    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      ...pickInstructionRequestArgs,
    });

    if (!request) {
      throw new NotFoundException('Клиентская заявка не найдена.');
    }

    this.clientScopes.requireClientAccess(user, request.clientId, 'read');

    if (request.type !== ClientRequestType.OUTBOUND) {
      throw new BadRequestException('Складская инструкция доступна только для заявок на отгрузку.');
    }

    const skuByBarcode = await this.resolveMissingSkusByBarcode(request);
    const rows = this.prepareRows(request, skuByBarcode);
    const balances = await this.loadAvailableBalances(request.clientId, rows);
    const { instructionRows, boxAllocations } = this.allocateRows(rows, balances);
    const boxes = await this.buildBoxSummaries(request.clientId, boxAllocations);

    const document: PickInstructionDocument = {
      requestId: request.id,
      title: `Инструкция сборки ${request.title}`,
      fileName: `${safeFileName(`pick-instruction-${request.title}-${request.id.slice(0, 8)}`)}.html`,
      requestTitle: request.title,
      requestStatus: request.status,
      requestStatusLabel: requestStatusLabel(request.status),
      priority: request.priority,
      priorityLabel: requestPriorityLabel(request.priority),
      client: request.client,
      generatedAt: new Date().toISOString(),
      desiredDate: request.desiredDate?.toISOString() ?? null,
      deliveryAddress: request.deliveryAddress,
      totalRequested: instructionRows.reduce((sum, row) => sum + row.requestedQuantity, 0),
      totalAllocated: instructionRows.reduce((sum, row) => sum + row.allocatedQuantity, 0),
      totalShortage: instructionRows.reduce((sum, row) => sum + row.shortageQuantity, 0),
      rowsCount: instructionRows.length,
      readyRowsCount: instructionRows.filter((row) => row.status === 'READY').length,
      shortageRowsCount: instructionRows.filter((row) => row.status !== 'READY').length,
      boxesCount: boxes.length,
      fullBoxesCount: boxes.filter((box) => box.isFullBox).length,
      rows: instructionRows,
      boxes,
    };

    return {
      ...document,
      html: renderPickInstructionHtml(document),
    };
  }

  private async resolveMissingSkusByBarcode(request: RequestForInstruction) {
    const barcodes = [
      ...new Set(
        request.items
          .filter((item) => !item.skuId && item.barcode)
          .map((item) => item.barcode)
          .filter((barcode): barcode is string => Boolean(barcode)),
      ),
    ];

    if (barcodes.length === 0) {
      return new Map<string, SkuForInstruction | 'duplicate'>();
    }

    const barcodeRows = await this.prisma.barcode.findMany({
      where: {
        value: { in: barcodes },
        sku: { clientId: request.clientId },
      },
      include: {
        sku: {
          include: {
            barcodes: {
              select: {
                value: true,
                isPrimary: true,
              },
            },
          },
        },
      },
    });
    const result = new Map<string, SkuForInstruction | 'duplicate'>();

    for (const barcode of barcodes) {
      const matches = barcodeRows.filter((row) => row.value === barcode);
      if (matches.length === 1) {
        result.set(barcode, matches[0].sku);
      } else if (matches.length > 1) {
        result.set(barcode, 'duplicate');
      }
    }

    return result;
  }

  private prepareRows(request: RequestForInstruction, skuByBarcode: Map<string, SkuForInstruction | 'duplicate'>) {
    return request.items.map((item, index) => {
      const resolvedSku = item.sku ?? (item.barcode ? skuByBarcode.get(item.barcode) : null) ?? null;
      const status: PickInstructionRowStatus =
        resolvedSku && resolvedSku !== 'duplicate' ? 'SHORTAGE' : 'SKU_NOT_FOUND';
      const primaryBarcode = resolvedSku && resolvedSku !== 'duplicate' ? primaryBarcodeValue(resolvedSku) : null;

      return {
        position: index + 1,
        item,
        sku: resolvedSku === 'duplicate' ? null : resolvedSku,
        duplicateBarcode: resolvedSku === 'duplicate',
        skuId: resolvedSku && resolvedSku !== 'duplicate' ? resolvedSku.id : null,
        internalSku: resolvedSku && resolvedSku !== 'duplicate' ? resolvedSku.internalSku : null,
        name: item.name ?? (resolvedSku && resolvedSku !== 'duplicate' ? resolvedSku.name : null),
        barcode: item.barcode ?? primaryBarcode,
        requestedQuantity: item.quantity,
        status,
      };
    });
  }

  private async loadAvailableBalances(clientId: string, rows: Array<{ skuId: string | null }>) {
    const skuIds = [...new Set(rows.map((row) => row.skuId).filter((skuId): skuId is string => Boolean(skuId)))];
    if (skuIds.length === 0) {
      return [];
    }

    return this.prisma.stockBalance.findMany({
      where: {
        clientId,
        skuId: { in: skuIds },
        status: StockStatus.AVAILABLE,
        quantity: { gt: 0 },
        boxId: { not: null },
      },
      ...stockBalanceArgs,
      orderBy: [{ updatedAt: 'asc' }],
    });
  }

  private allocateRows(
    rows: ReturnType<PickInstructionService['prepareRows']>,
    balances: BalanceForInstruction[],
  ) {
    const balancesBySkuId = groupBalancesBySkuId(balances);
    const remainingByBalance = new Map(balances.map((balance) => [balance.id, balance.quantity]));
    const boxAllocations = new Map<string, { box: BalanceForInstruction; allocatedQuantity: number; lineIds: Set<string> }>();
    const instructionRows: PickInstructionRow[] = [];

    for (const row of rows) {
      const allocations: PickInstructionAllocation[] = [];
      let remaining = row.requestedQuantity;

      if (row.skuId) {
        for (const balance of balancesBySkuId.get(row.skuId) ?? []) {
          if (remaining <= 0) {
            break;
          }

          const available = remainingByBalance.get(balance.id) ?? 0;
          if (available <= 0 || !balance.boxId || !balance.box) {
            continue;
          }

          const quantity = Math.min(available, remaining);
          remainingByBalance.set(balance.id, available - quantity);
          remaining -= quantity;
          allocations.push({
            balanceId: balance.id,
            boxId: balance.boxId,
            boxCode: balance.box.code,
            palletId: balance.palletId,
            palletCode: balance.pallet?.code ?? null,
            quantity,
          });
          const boxAllocation = boxAllocations.get(balance.boxId) ?? {
            box: balance,
            allocatedQuantity: 0,
            lineIds: new Set<string>(),
          };
          boxAllocation.allocatedQuantity += quantity;
          boxAllocation.lineIds.add(row.item.id);
          boxAllocations.set(balance.boxId, boxAllocation);
        }
      }

      const allocatedQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      const shortageQuantity = Math.max(0, row.requestedQuantity - allocatedQuantity);
      const status = this.rowStatus(row, shortageQuantity);

      instructionRows.push({
        position: row.position,
        itemId: row.item.id,
        skuId: row.skuId,
        internalSku: row.internalSku,
        name: row.name,
        barcode: row.barcode,
        requestedQuantity: row.requestedQuantity,
        allocatedQuantity,
        shortageQuantity,
        status,
        statusLabel: rowStatusLabel(status),
        comment: this.rowComment(row, shortageQuantity),
        allocations,
      });
    }

    return { instructionRows, boxAllocations };
  }

  private rowStatus(row: { skuId: string | null }, shortageQuantity: number): PickInstructionRowStatus {
    if (!row.skuId) {
      return 'SKU_NOT_FOUND';
    }

    return shortageQuantity > 0 ? 'SHORTAGE' : 'READY';
  }

  private rowComment(row: { skuId: string | null; duplicateBarcode: boolean }, shortageQuantity: number) {
    if (row.duplicateBarcode) {
      return 'Баркод привязан к нескольким SKU клиента.';
    }

    if (!row.skuId) {
      return 'Не найден SKU по строке заявки.';
    }

    return shortageQuantity > 0 ? `Не хватает ${shortageQuantity} шт. в AVAILABLE.` : null;
  }

  private async buildBoxSummaries(
    clientId: string,
    boxAllocations: Map<string, { box: BalanceForInstruction; allocatedQuantity: number; lineIds: Set<string> }>,
  ): Promise<PickInstructionBoxSummary[]> {
    const boxIds = [...boxAllocations.keys()];
    if (boxIds.length === 0) {
      return [];
    }

    const totals = await this.prisma.stockBalance.groupBy({
      by: ['boxId'],
      where: {
        clientId,
        status: StockStatus.AVAILABLE,
        boxId: { in: boxIds },
        quantity: { gt: 0 },
      },
      _sum: { quantity: true },
    });
    const availableByBoxId = new Map(totals.map((total) => [total.boxId, total._sum.quantity ?? 0]));

    return boxIds
      .map((boxId) => {
        const allocation = boxAllocations.get(boxId)!;
        const availableQuantity = availableByBoxId.get(boxId) ?? allocation.allocatedQuantity;
        const isFullBox = allocation.allocatedQuantity >= availableQuantity;

        return {
          boxId,
          boxCode: allocation.box.box?.code ?? boxId,
          palletId: allocation.box.palletId,
          palletCode: allocation.box.pallet?.code ?? null,
          allocatedQuantity: allocation.allocatedQuantity,
          availableQuantity,
          linesCount: allocation.lineIds.size,
          isFullBox,
          comment: isFullBox ? 'ЦЕЛЫЙ короб в сборку' : 'Частичный отбор из короба',
        };
      })
      .sort((left, right) => left.boxCode.localeCompare(right.boxCode, 'ru'));
  }
}

const pickInstructionRequestArgs = {
  include: {
    client: {
      select: {
        id: true,
        code: true,
        name: true,
      },
    },
    items: {
      include: {
        sku: {
          include: {
            barcodes: {
              select: {
                value: true,
                isPrimary: true,
              },
            },
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    },
  },
} satisfies Prisma.ClientRequestDefaultArgs;

const stockBalanceArgs = {
  include: {
    box: {
      select: {
        id: true,
        code: true,
      },
    },
    pallet: {
      select: {
        id: true,
        code: true,
      },
    },
  },
} satisfies Prisma.StockBalanceDefaultArgs;

function groupBalancesBySkuId(balances: BalanceForInstruction[]) {
  const result = new Map<string, BalanceForInstruction[]>();
  balances.forEach((balance) => {
    result.set(balance.skuId, [...(result.get(balance.skuId) ?? []), balance]);
  });
  return result;
}

function primaryBarcodeValue(sku: SkuForInstruction) {
  return sku.barcodes.find((barcode) => barcode.isPrimary)?.value ?? sku.barcodes[0]?.value ?? null;
}
