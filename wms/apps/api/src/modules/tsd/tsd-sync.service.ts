import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientRequestStatus, ClientRequestType, StockStatus, TsdReviewReason } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { PickInstructionService } from '../stock/pick-instruction.service';
import { StockOperationsService } from '../stock/stock-operations.service';
import { ScanOperationDto, SyncTsdOperationsDto } from './dto/scan-operation.dto';
import { TsdDeviceService } from './tsd-device.service';
import { TsdOperationLogService } from './tsd-operation-log.service';
import { TsdOperationResult } from './tsd-operation.types';
import { TsdPayloadParser } from './tsd-payload.parser';

@Injectable()
export class TsdSyncService {
  constructor(
    private readonly stockOperations: StockOperationsService,
    private readonly pickInstructions: PickInstructionService,
    private readonly devices: TsdDeviceService,
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
    private readonly payloadParser: TsdPayloadParser,
    private readonly operationLog: TsdOperationLogService,
  ) {}

  async acceptOperation(operation: ScanOperationDto, user: AuthUser) {
    const [result] = await this.syncOperations({ operations: [operation] }, user);
    return result;
  }

  async syncOperations(dto: SyncTsdOperationsDto, user: AuthUser) {
    await this.devices.touchActiveDevice(user.deviceId);

    const results: TsdOperationResult[] = [];

    for (const operation of dto.operations) {
      results.push(await this.applyOperation(operation, user));
    }

    return results;
  }

  listReviewQueue(user: AuthUser) {
    return this.operationLog.listReviewQueue(user);
  }

  listClients(user: AuthUser) {
    const clientFilter = this.clientScopes.resolveClientFilter(user);
    return this.prisma.client.findMany({
      where: {
        id: clientFilter,
        status: 'ACTIVE',
      },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
      },
    });
  }

  async listActiveRequests(user: AuthUser) {
    const clientFilter = this.clientScopes.resolveClientFilter(user);
    const requests = await this.prisma.clientRequest.findMany({
      where: {
        clientId: clientFilter,
        type: ClientRequestType.OUTBOUND,
        status: {
          in: [
            ClientRequestStatus.SUBMITTED,
            ClientRequestStatus.IN_REVIEW,
            ClientRequestStatus.APPROVED,
            ClientRequestStatus.IN_WORK,
            ClientRequestStatus.PACKED,
          ],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        destinationCity: true,
        createdAt: true,
        updatedAt: true,
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
    const workerMap = await this.loadRequestWorkers(requests.map((request) => request.id));
    return requests.map((request) => ({
      ...request,
      activeWorkers: workerMap.get(request.id) ?? [],
    }));
  }

  async getRequestBoxSearch(requestId: string, user: AuthUser, deviceCode?: string, stage?: string) {
    await this.touchRequestWorker(requestId, user, tsdStageLabel(stage), deviceCode);
    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const requiredBoxes = this.requiredSearchBoxes(document);
    const foundBoxes = await this.loadFoundSearchBoxes(requestId);

    return {
      ...this.boxSearchState(requestId, requiredBoxes, foundBoxes, null),
      stage: normalizeTsdStage(stage),
    };
  }

  async scanRequestBox(requestId: string, dto: { boxCode?: string; deviceCode?: string }, user: AuthUser) {
    await this.touchRequestWorker(requestId, user, 'Поиск коробов', dto.deviceCode);
    const scannedBox = dto.boxCode?.trim();
    if (!scannedBox) {
      throw new BadRequestException('Сканируйте номер короба.');
    }

    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const requiredBoxes = this.requiredSearchBoxes(document);
    const requiredByNormalized = new Map(requiredBoxes.map((box) => [normalizeBoxCode(box), box]));
    const matchedBox = requiredByNormalized.get(normalizeBoxCode(scannedBox));
    const foundBoxes = await this.loadFoundSearchBoxes(requestId);
    const wasAlreadyFound = matchedBox ? foundBoxes.has(matchedBox) : false;

    if (matchedBox && !wasAlreadyFound) {
      foundBoxes.add(matchedBox);
      await this.saveFoundSearchBoxes(requestId, foundBoxes, user.id);
    }

    return this.boxSearchState(requestId, requiredBoxes, foundBoxes, {
      boxCode: scannedBox,
      matched: Boolean(matchedBox) && !wasAlreadyFound,
      alreadyFound: wasAlreadyFound,
      matchedBox: matchedBox ?? null,
    });
  }

  async getRequestRelabel(requestId: string, user: AuthUser, deviceCode?: string) {
    await this.touchRequestWorker(requestId, user, 'Перемаркировка', deviceCode);
    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const tasks = this.relabelTasks(document);
    const completed = await this.loadRelabelCompleted(requestId);
    return this.relabelState(requestId, tasks, completed, null);
  }

  async scanRelabelSource(
    requestId: string,
    dto: { boxCode?: string; barcode?: string; deviceCode?: string },
    user: AuthUser,
  ) {
    await this.touchRequestWorker(requestId, user, 'Перемаркировка', dto.deviceCode);
    const boxCode = dto.boxCode?.trim();
    const barcode = dto.barcode?.trim();
    if (!boxCode || !barcode) {
      throw new BadRequestException('Сканируйте короб и исходный штрихкод.');
    }

    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const tasks = this.relabelTasks(document);
    const completed = await this.loadRelabelCompleted(requestId);
    const task = tasks.find(
      (item) =>
        normalizeBoxCode(item.sourceBox) === normalizeBoxCode(boxCode) &&
        normalizeBoxCode(item.sourceBarcode) === normalizeBoxCode(barcode) &&
        item.quantity - (completed.get(item.id) ?? 0) > 0,
    );

    if (!task) {
      throw new BadRequestException('Неправильный товар: отсканированный ШК не совпадает с заданием перемаркировки.');
    }

    return this.relabelState(requestId, tasks, completed, {
      type: 'source',
      matched: true,
      task,
    });
  }

  async scanRelabelTarget(
    requestId: string,
    dto: { lineId?: string; targetBarcode?: string; deviceCode?: string },
    user: AuthUser,
  ) {
    await this.touchRequestWorker(requestId, user, 'Перемаркировка', dto.deviceCode);
    const lineId = dto.lineId?.trim();
    const targetBarcode = dto.targetBarcode?.trim();
    if (!lineId || !targetBarcode) {
      throw new BadRequestException('Сканируйте новый штрихкод перемаркировки.');
    }

    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const tasks = this.relabelTasks(document);
    const task = tasks.find((item) => item.id === lineId);
    if (!task) {
      throw new BadRequestException('Строка перемаркировки не найдена.');
    }
    if (normalizeBoxCode(task.targetBarcode) !== normalizeBoxCode(targetBarcode)) {
      throw new BadRequestException('Новый ШК не совпадает с заданием перемаркировки.');
    }

    const completed = await this.loadRelabelCompleted(requestId);
    const current = completed.get(task.id) ?? 0;
    if (current >= task.quantity) {
      throw new BadRequestException('Эта строка перемаркировки уже выполнена.');
    }
    completed.set(task.id, current + 1);
    await this.saveRelabelCompleted(requestId, completed, user.id);
    const moveTasks = this.moveTasks(document);
    const moveState = await this.loadMoveState(requestId);
    await this.finalizeTsdPackingIfReady(requestId, user, document, moveTasks, moveState);

    return this.relabelState(requestId, tasks, completed, {
      type: 'target',
      matched: true,
      task,
    });
  }

  async getRequestMoves(requestId: string, user: AuthUser, deviceCode?: string) {
    await this.touchRequestWorker(requestId, user, 'Перемещения', deviceCode);
    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const tasks = this.moveTasks(document);
    const moveState = await this.loadMoveState(requestId);
    await this.finalizeTsdPackingIfReady(requestId, user, document, tasks, moveState);
    return this.movesState(requestId, tasks, moveState, null);
  }

  async openMoveTargetBox(
    requestId: string,
    dto: { targetBoxCode?: string; deviceCode?: string },
    user: AuthUser,
  ) {
    await this.touchRequestWorker(requestId, user, 'Перемещения', dto.deviceCode);
    const targetBoxCode = dto.targetBoxCode?.trim();
    if (!targetBoxCode) {
      throw new BadRequestException('Сканируйте новый короб для перемещений.');
    }

    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const tasks = this.moveTasks(document);
    const moveState = await this.loadMoveState(requestId);
    moveState.currentTargetBox = targetBoxCode;
    await this.saveMoveState(requestId, moveState, user.id);
    return this.movesState(requestId, tasks, moveState, { type: 'target', matched: true, targetBoxCode });
  }

  async scanMoveItem(
    requestId: string,
    dto: { sourceBox?: string; barcode?: string; targetBoxCode?: string; deviceCode?: string },
    user: AuthUser,
  ) {
    await this.touchRequestWorker(requestId, user, 'Перемещения', dto.deviceCode);
    const sourceBox = dto.sourceBox?.trim();
    const barcode = dto.barcode?.trim();
    if (!sourceBox || !barcode) {
      throw new BadRequestException('Сканируйте исходный короб и ШК товара для перемещения.');
    }

    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      select: { id: true, clientId: true, type: true, status: true },
    });
    if (!request) {
      throw new NotFoundException('Клиентская заявка не найдена.');
    }
    if (request.type !== ClientRequestType.OUTBOUND) {
      throw new BadRequestException('Перемещения ТСД доступны только для заявок на отгрузку.');
    }
    this.clientScopes.requireClientAccess(user, request.clientId, 'write');

    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const tasks = this.moveTasks(document);
    const moveState = await this.loadMoveState(requestId);
    const targetBoxCode = dto.targetBoxCode?.trim() || moveState.currentTargetBox;
    if (!targetBoxCode) {
      throw new BadRequestException('Сначала сканируйте новый короб, в который складывается товар.');
    }

    const task = tasks.find(
      (item) =>
        normalizeBoxCode(item.sourceBox) === normalizeBoxCode(sourceBox) &&
        normalizeBoxCode(item.barcode) === normalizeBoxCode(barcode) &&
        item.quantity - (moveState.completed.get(item.id) ?? 0) > 0,
    );
    if (!task) {
      throw new BadRequestException('Этот товар не требуется перемещать из выбранного короба.');
    }

    const current = moveState.completed.get(task.id) ?? 0;
    await this.stockOperations.transferBetweenBoxes(
      {
        clientId: request.clientId,
        barcode: task.barcode,
        fromBoxCode: task.sourceBox,
        toBoxCode: targetBoxCode,
        quantity: 1,
        status: StockStatus.AVAILABLE,
        sourceDocument: requestId,
        idempotencyKey: `tsd-move:${requestId}:${task.id}:${current + 1}`,
        comment: `ТСД ${dto.deviceCode || user.deviceCode || ''}, сотрудник ${user.name}: перемещение по заявке ${requestId}`,
      },
      user,
    );

    moveState.currentTargetBox = targetBoxCode;
    moveState.completed.set(task.id, current + 1);
    await this.saveMoveState(requestId, moveState, user.id);
    await this.finalizeTsdPackingIfReady(requestId, user, document, tasks, moveState);
    return this.movesState(requestId, tasks, moveState, { type: 'item', matched: true, task, targetBoxCode });
  }

  async finishRequestMoves(requestId: string, dto: { deviceCode?: string }, user: AuthUser) {
    await this.touchRequestWorker(requestId, user, 'Перемещения', dto.deviceCode);
    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const tasks = this.moveTasks(document);
    const moveState = await this.loadMoveState(requestId);
    const remaining = tasks.reduce((sum, task) => sum + Math.max(0, task.quantity - (moveState.completed.get(task.id) ?? 0)), 0);
    if (remaining > 0) {
      throw new BadRequestException(`Перемещения еще не завершены. Осталось единиц: ${remaining}.`);
    }

    moveState.currentTargetBox = '';
    await this.saveMoveState(requestId, moveState, user.id);
    await this.finalizeTsdPackingIfReady(requestId, user, document, tasks, moveState);
    return this.movesState(requestId, tasks, moveState, { type: 'finish', matched: true });
  }

  async getSkuByBarcode(clientId: string, barcode: string, user: AuthUser) {
    const normalizedClientId = clientId?.trim();
    const normalizedBarcode = barcode?.trim();
    if (!normalizedClientId || !normalizedBarcode) {
      throw new BadRequestException('Нужно указать клиента и штрихкод.');
    }

    this.clientScopes.requireClientAccess(user, normalizedClientId, 'write');
    const row = await this.prisma.barcode.findFirst({
      where: {
        value: normalizedBarcode,
        sku: { clientId: normalizedClientId },
      },
      include: {
        sku: {
          select: {
            id: true,
            internalSku: true,
            clientSku: true,
            article: true,
            name: true,
            color: true,
            size: true,
            brand: true,
            category: true,
            needsChestnyZnak: true,
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

    if (!row) {
      throw new NotFoundException('Товар с таким штрихкодом не найден у клиента.');
    }

    return row.sku;
  }

  private async applyOperation(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    try {
      if (user.deviceCode && operation.deviceId !== user.deviceCode) {
        return await this.operationLog.recordResult(
          operation,
          user,
          'REJECTED',
          'Операция пришла не от устройства из access token.',
          TsdReviewReason.DEVICE_MISMATCH,
        );
      }

      const existing = await this.operationLog.findExisting(operation.operationKey);
      if (existing) {
        return this.operationLog.existingResult(operation, existing);
      }

      if (operation.operationType === 'move_scan') {
        return await this.applyMoveScan(operation, user);
      }

      if (operation.operationType === 'receipt_scan') {
        return await this.applyReceiptScan(operation, user);
      }

      return await this.applyInventoryScan(operation, user);
    } catch (caught) {
      return await this.operationLog.recordResult(
        operation,
        user,
        'REJECTED',
        caught instanceof Error ? caught.message : 'Операция ТСД отклонена.',
        TsdReviewReason.VALIDATION_ERROR,
      );
    }
  }

  private async applyMoveScan(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    const payload = this.payloadParser.parseMovePayload(operation.payload);
    const transfer = await this.stockOperations.transferBetweenBoxes(
      {
        clientId: payload.clientId,
        barcode: payload.barcode,
        skuId: payload.skuId,
        fromBoxCode: payload.fromBoxCode,
        toBoxCode: payload.toBoxCode,
        quantity: payload.quantity,
        status: payload.status,
        idempotencyKey: operation.operationKey,
        comment: payload.comment ?? `ТСД ${operation.deviceId}, сборщик ${user.name}`,
      },
      user,
    );

    return this.operationLog.recordResult(
      operation,
      user,
      transfer.status === 'ALREADY_APPLIED' ? 'ALREADY_APPLIED' : 'APPLIED',
    );
  }

  private async applyReceiptScan(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    const payload = this.payloadParser.parseReceiptPayload(operation.payload);

    try {
      const receipt = await this.stockOperations.receiveIntoBox(
        {
          clientId: payload.clientId,
          barcode: payload.barcode,
          skuId: payload.skuId,
          boxCode: payload.boxCode,
          quantity: payload.quantity,
          kiz: payload.kiz,
          status: payload.status,
          sourceDocument: payload.sourceDocument,
          idempotencyKey: operation.operationKey,
          comment: payload.comment ?? `Приемка ТСД ${operation.deviceId}, сборщик ${user.name}`,
        },
        user,
      );

      return this.operationLog.recordResult(
        operation,
        user,
        receipt.status === 'ALREADY_APPLIED' ? 'ALREADY_APPLIED' : 'APPLIED',
      );
    } catch (caught) {
      return this.operationLog.recordResult(
        operation,
        user,
        'NEEDS_REVIEW',
        caught instanceof Error ? caught.message : 'Приемка ТСД требует разбора.',
        TsdReviewReason.RECEIPT_FAILED,
      );
    }
  }

  private async applyInventoryScan(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    const payload = this.payloadParser.parseInventoryPayload(operation.payload);
    this.clientScopes.requireClientAccess(user, payload.clientId, 'write');

    const sku = await this.findSku(payload.clientId, payload);
    if (!sku) {
      return this.operationLog.recordResult(
        operation,
        user,
        'NEEDS_REVIEW',
        'SKU или штрихкод не найден у клиента.',
        TsdReviewReason.SKU_NOT_FOUND,
      );
    }

    const box = await this.prisma.box.findUnique({
      where: { clientId_code: { clientId: payload.clientId, code: payload.boxCode } },
    });
    if (!box) {
      return this.operationLog.recordResult(
        operation,
        user,
        'NEEDS_REVIEW',
        `Короб ${payload.boxCode} не найден.`,
        TsdReviewReason.BOX_NOT_FOUND,
      );
    }

    const status = payload.status ?? StockStatus.AVAILABLE;
    const balance = await this.prisma.stockBalance.findFirst({
      where: {
        clientId: payload.clientId,
        skuId: sku.id,
        boxId: box.id,
        status,
      },
    });
    const currentQuantity = balance?.quantity ?? 0;

    if (currentQuantity !== payload.countedQuantity) {
      return this.operationLog.recordResult(
        operation,
        user,
        'NEEDS_REVIEW',
        `Расхождение инвентаризации: в WMS ${currentQuantity}, на ТСД ${payload.countedQuantity}.`,
        TsdReviewReason.INVENTORY_MISMATCH,
      );
    }

    return this.operationLog.recordResult(operation, user, 'ACCEPTED', 'Инвентаризация совпала с остатком WMS.');
  }

  private findSku(clientId: string, payload: { skuId?: string; barcode?: string }) {
    if (payload.skuId) {
      return this.prisma.sku.findFirst({ where: { id: payload.skuId, clientId } });
    }

    return this.prisma.barcode
      .findFirst({
        where: {
          value: payload.barcode,
          sku: { clientId },
        },
        include: { sku: true },
      })
      .then((barcode) => barcode?.sku ?? null);
  }

  private requiredSearchBoxes(document: {
    warehouseRows: Array<{ sourceBox: string }>;
    warehouseBalanceMoves: Array<{ sourceBox: string }>;
    warehouseWholeBoxes: Array<{ box: string }>;
  }) {
    // New balance boxes are created during movement and stay in warehouse stock.
    // The search stage must find only boxes that already participate in the shipment plan.
    return [
      ...new Set(
        [
          ...document.warehouseRows.map((row) => row.sourceBox),
          ...document.warehouseBalanceMoves.map((row) => row.sourceBox),
          ...document.warehouseWholeBoxes.map((row) => row.box),
        ]
          .map((value) => value.trim())
          .filter((value) => value !== 'БЕЗ КОРОБА')
          .filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right, 'ru', { numeric: true }));
  }

  private async loadFoundSearchBoxes(requestId: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: boxSearchKey(requestId) },
    });
    const value = setting?.value;
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const foundBoxes = Array.isArray(payload.foundBoxes) ? payload.foundBoxes : [];
    return new Set(foundBoxes.filter((box): box is string => typeof box === 'string' && box.trim().length > 0));
  }

  private async saveFoundSearchBoxes(requestId: string, foundBoxes: Set<string>, userId: string) {
    const boxes = [...foundBoxes].sort((left, right) => left.localeCompare(right, 'ru', { numeric: true }));
    await this.prisma.systemSetting.upsert({
      where: { key: boxSearchKey(requestId) },
      update: {
        value: { foundBoxes: boxes },
        updatedByUserId: userId,
      },
      create: {
        key: boxSearchKey(requestId),
        value: { foundBoxes: boxes },
        updatedByUserId: userId,
      },
    });
  }

  private relabelTasks(document: {
    warehouseRows: Array<{
      sourceBox: string;
      artOnBox: string;
      barcodeOnBox: string;
      size: string;
      quantity: number;
      rebrandNote: string;
    }>;
  }) {
    const tasks = new Map<string, RelabelTask>();
    for (const row of document.warehouseRows) {
      const parsed = parseRelabelNote(row.rebrandNote);
      if (!row.sourceBox || !parsed) {
        continue;
      }
      const key = relabelTaskId(row.sourceBox, parsed.sourceBarcode, parsed.targetBarcode, row.artOnBox, row.size);
      const existing = tasks.get(key);
      if (existing) {
        existing.quantity += row.quantity;
        continue;
      }
      tasks.set(key, {
        id: key,
        sourceBox: row.sourceBox,
        article: row.artOnBox,
        size: row.size,
        sourceBarcode: parsed.sourceBarcode,
        targetBarcode: parsed.targetBarcode,
        quantity: row.quantity,
      });
    }
    return [...tasks.values()].sort((left, right) =>
      left.sourceBox.localeCompare(right.sourceBox, 'ru', { numeric: true }) ||
      left.article.localeCompare(right.article, 'ru', { numeric: true }) ||
      left.sourceBarcode.localeCompare(right.sourceBarcode, 'ru', { numeric: true }),
    );
  }

  private async loadRelabelCompleted(requestId: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: relabelKey(requestId) },
    });
    const value = setting?.value;
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const completed = payload.completed && typeof payload.completed === 'object' && !Array.isArray(payload.completed)
      ? (payload.completed as Record<string, unknown>)
      : {};
    return new Map(
      Object.entries(completed)
        .map(([key, value]) => [key, Number(value)] as const)
        .filter(([, value]) => Number.isInteger(value) && value > 0),
    );
  }

  private async saveRelabelCompleted(requestId: string, completed: Map<string, number>, userId: string) {
    const value = Object.fromEntries([...completed.entries()].filter(([, count]) => count > 0));
    await this.prisma.systemSetting.upsert({
      where: { key: relabelKey(requestId) },
      update: {
        value: { completed: value },
        updatedByUserId: userId,
      },
      create: {
        key: relabelKey(requestId),
        value: { completed: value },
        updatedByUserId: userId,
      },
    });
  }

  private relabelState(
    requestId: string,
    tasks: RelabelTask[],
    completed: Map<string, number>,
    lastScan: null | { type: 'source' | 'target'; matched: boolean; task: RelabelTask },
  ) {
    const rows = tasks.map((task) => {
      const done = Math.min(completed.get(task.id) ?? 0, task.quantity);
      return {
        ...task,
        completed: done,
        remaining: Math.max(0, task.quantity - done),
      };
    });
    const pendingRows = rows.filter((row) => row.remaining > 0);
    const boxes = [...new Set(pendingRows.map((row) => row.sourceBox))]
      .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true }))
      .map((boxCode) => {
        const boxRows = pendingRows.filter((row) => row.sourceBox === boxCode);
        return {
          boxCode,
          totalRemaining: boxRows.reduce((sum, row) => sum + row.remaining, 0),
          rows: boxRows,
        };
      });
    const total = rows.reduce((sum, row) => sum + row.quantity, 0);
    const completedCount = rows.reduce((sum, row) => sum + row.completed, 0);
    return {
      requestId,
      total,
      completed: completedCount,
      remaining: Math.max(0, total - completedCount),
      isComplete: total === completedCount,
      boxes,
      rows: pendingRows,
      lastScan,
    };
  }

  private moveTasks(document: {
    warehouseBalanceMoves: Array<{
      sourceBox: string;
      artOnBox: string;
      barcodeOnBox: string;
      size: string;
      quantity: number;
      newBox: string;
    }>;
  }) {
    const tasks = new Map<string, MoveTask>();
    for (const row of document.warehouseBalanceMoves) {
      if (!row.sourceBox || !row.barcodeOnBox || row.quantity <= 0) {
        continue;
      }
      const key = moveTaskId(row.sourceBox, row.barcodeOnBox, row.artOnBox, row.size);
      const existing = tasks.get(key);
      if (existing) {
        existing.quantity += row.quantity;
        continue;
      }
      tasks.set(key, {
        id: key,
        sourceBox: row.sourceBox,
        article: row.artOnBox,
        size: row.size,
        barcode: row.barcodeOnBox,
        suggestedTargetBox: row.newBox,
        quantity: row.quantity,
      });
    }
    return [...tasks.values()].sort((left, right) =>
      left.sourceBox.localeCompare(right.sourceBox, 'ru', { numeric: true }) ||
      left.article.localeCompare(right.article, 'ru', { numeric: true }) ||
      left.barcode.localeCompare(right.barcode, 'ru', { numeric: true }),
    );
  }

  private async loadMoveState(requestId: string): Promise<MoveState> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: movesKey(requestId) },
    });
    const value = setting?.value;
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const completed = payload.completed && typeof payload.completed === 'object' && !Array.isArray(payload.completed)
      ? (payload.completed as Record<string, unknown>)
      : {};
    return {
      currentTargetBox: typeof payload.currentTargetBox === 'string' ? payload.currentTargetBox : '',
      completed: new Map(
        Object.entries(completed)
          .map(([key, value]) => [key, Number(value)] as const)
          .filter(([, value]) => Number.isInteger(value) && value > 0),
      ),
    };
  }

  private async saveMoveState(requestId: string, state: MoveState, userId: string) {
    const completed = Object.fromEntries([...state.completed.entries()].filter(([, count]) => count > 0));
    await this.prisma.systemSetting.upsert({
      where: { key: movesKey(requestId) },
      update: {
        value: { currentTargetBox: state.currentTargetBox, completed },
        updatedByUserId: userId,
      },
      create: {
        key: movesKey(requestId),
        value: { currentTargetBox: state.currentTargetBox, completed },
        updatedByUserId: userId,
      },
    });
  }

  private movesState(
    requestId: string,
    tasks: MoveTask[],
    state: MoveState,
    lastScan: null | { type: string; matched: boolean; task?: MoveTask; targetBoxCode?: string },
  ) {
    const rows = tasks.map((task) => {
      const done = Math.min(state.completed.get(task.id) ?? 0, task.quantity);
      return {
        ...task,
        completed: done,
        remaining: Math.max(0, task.quantity - done),
      };
    });
    const pendingRows = rows.filter((row) => row.remaining > 0);
    const boxes = [...new Set(pendingRows.map((row) => row.sourceBox))]
      .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true }))
      .map((boxCode) => {
        const boxRows = pendingRows.filter((row) => row.sourceBox === boxCode);
        return {
          boxCode,
          totalRemaining: boxRows.reduce((sum, row) => sum + row.remaining, 0),
          rows: boxRows,
        };
      });
    const total = rows.reduce((sum, row) => sum + row.quantity, 0);
    const completed = rows.reduce((sum, row) => sum + row.completed, 0);
    return {
      requestId,
      total,
      completed,
      remaining: Math.max(0, total - completed),
      isComplete: total === completed,
      currentTargetBox: state.currentTargetBox,
      boxes,
      rows: pendingRows,
      lastScan,
    };
  }

  private async finalizeTsdPackingIfReady(
    requestId: string,
    user: AuthUser,
    document: Awaited<ReturnType<PickInstructionService['getRequestInstruction']>>,
    tasks: MoveTask[],
    state: MoveState,
  ) {
    const moveRemaining = tasks.reduce((sum, task) => sum + Math.max(0, task.quantity - (state.completed.get(task.id) ?? 0)), 0);
    if (moveRemaining > 0) {
      return;
    }

    const requiredBoxes = this.requiredSearchBoxes(document);
    const foundBoxes = await this.loadFoundSearchBoxes(requestId);
    if (!this.boxSearchState(requestId, requiredBoxes, foundBoxes, null).isComplete) {
      return;
    }

    const relabelTasks = this.relabelTasks(document);
    const relabelCompleted = await this.loadRelabelCompleted(requestId);
    if (!this.relabelState(requestId, relabelTasks, relabelCompleted, null).isComplete) {
      return;
    }

    await this.createPackedPackages(requestId, user, document);
  }

  private async createPackedPackages(
    requestId: string,
    user: AuthUser,
    document: Awaited<ReturnType<PickInstructionService['getRequestInstruction']>>,
  ) {
    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      include: { items: true, packages: true },
    });
    if (!request) {
      throw new NotFoundException('Клиентская заявка не найдена.');
    }
    if (request.status === ClientRequestStatus.PACKED || request.status === ClientRequestStatus.DONE) {
      return;
    }

    const balanceMoveRows = new Set(document.warehouseBalanceMoves.map((row) => balanceMoveRowKey(row)));
    const shipmentRows = document.warehouseRows.filter((row) =>
      row.sourceBox &&
      row.quantity > 0 &&
      !balanceMoveRows.has(balanceMoveRowKey(row)) &&
      !row.comment.toLowerCase().includes('переложить') &&
      !row.note.toLowerCase().includes('остаток'),
    );
    const plannedQuantity = shipmentRows.reduce((sum, row) => sum + row.quantity, 0);
    const requestQuantity = request.items.reduce((sum, item) => sum + item.quantity, 0);
    if (plannedQuantity !== requestQuantity) {
      throw new BadRequestException(`Контроль количества не пройден: заявка ${requestQuantity}, по коробам ${plannedQuantity}.`);
    }

    const remainingByItem = new Map(request.items.map((item) => [item.id, item.quantity]));
    const packageRows = new Map<string, Array<{ itemId: string; skuId: string | null; barcode: string | null; quantity: number }>>();
    for (const row of shipmentRows) {
      let remaining = row.quantity;
      while (remaining > 0) {
        const item = this.findRequestItemForPackageRow(request.items, remainingByItem, row.barcodeOnBox);
        if (!item) {
          throw new BadRequestException(`Не удалось сопоставить товар ${row.barcodeOnBox} с заявкой.`);
        }
        const available = remainingByItem.get(item.id) ?? 0;
        const quantity = Math.min(remaining, available);
        remainingByItem.set(item.id, available - quantity);
        const rows = packageRows.get(row.sourceBox) ?? [];
        rows.push({ itemId: item.id, skuId: item.skuId, barcode: row.barcodeOnBox || item.barcode, quantity });
        packageRows.set(row.sourceBox, rows);
        remaining -= quantity;
      }
    }

    const notPacked = [...remainingByItem.values()].reduce((sum, quantity) => sum + quantity, 0);
    if (notPacked > 0) {
      throw new BadRequestException(`Контроль количества не пройден: не распределено ${notPacked} ед.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clientRequestPackage.deleteMany({ where: { requestId } });
      for (const [packageCode, rows] of packageRows.entries()) {
        await tx.clientRequestPackage.create({
          data: {
            requestId,
            clientId: request.clientId,
            packageCode,
            packageType: 'BOX',
            comment: 'Упаковка сформирована ТСД после перемещений',
            createdByUserId: user.id,
            items: {
              create: rows.map((row) => ({
                requestItemId: row.itemId,
                skuId: row.skuId,
                barcode: row.barcode,
                quantity: row.quantity,
              })),
            },
          },
        });
      }
      await tx.clientRequest.update({
        where: { id: requestId },
        data: {
          status: ClientRequestStatus.PACKED,
          assignedToUserId: user.id,
        },
      });
    });
  }

  private findRequestItemForPackageRow(
    items: Array<{ id: string; skuId: string | null; barcode: string | null; comment: string | null; quantity: number }>,
    remainingByItem: Map<string, number>,
    barcode: string,
  ) {
    const normalized = normalizeBoxCode(barcode);
    return (
      items.find((item) => (remainingByItem.get(item.id) ?? 0) > 0 && normalizeBoxCode(finalRequestBarcode(item)) === normalized) ??
      items.find((item) => (remainingByItem.get(item.id) ?? 0) > 0 && normalizeBoxCode(item.barcode ?? '') === normalized) ??
      items.find((item) => (remainingByItem.get(item.id) ?? 0) > 0)
    );
  }

  private async loadRequestWorkers(requestIds: string[]) {
    const keys = requestIds.map(requestWorkersKey);
    const settings = keys.length
      ? await this.prisma.systemSetting.findMany({
          where: { key: { in: keys } },
        })
      : [];
    const now = Date.now();
    const byRequest = new Map<string, RequestWorker[]>();

    for (const setting of settings) {
      const requestId = setting.key.replace('TSD_REQUEST_WORKERS:', '');
      const value = setting.value;
      const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
      const rawWorkers = Array.isArray(payload.workers) ? payload.workers : [];
      const workers = rawWorkers
        .map(parseRequestWorker)
        .filter((worker): worker is RequestWorker => worker !== null)
        .filter((worker) => now - Date.parse(worker.lastSeenAt) <= 10 * 60 * 1000)
        .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
      byRequest.set(requestId, workers);
    }

    return byRequest;
  }

  private async touchRequestWorker(requestId: string, user: AuthUser, stage: string, deviceCode?: string) {
    const key = requestWorkersKey(requestId);
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    const value = setting?.value;
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const now = new Date().toISOString();
    const cutoff = Date.now() - 10 * 60 * 1000;
    const workers = (Array.isArray(payload.workers) ? payload.workers : [])
      .map(parseRequestWorker)
      .filter((worker): worker is RequestWorker => worker !== null)
      .filter((worker) => Date.parse(worker.lastSeenAt) > cutoff)
      .filter((worker) => worker.userId !== user.id || worker.deviceCode !== normalizeWorkerDeviceCode(user, deviceCode));

    workers.unshift({
      userId: user.id,
      userName: user.name,
      deviceId: user.deviceId ?? '',
      deviceCode: normalizeWorkerDeviceCode(user, deviceCode),
      stage,
      lastSeenAt: now,
    });

    await this.prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: { workers: workers.slice(0, 12) },
        updatedByUserId: user.id,
      },
      create: {
        key,
        value: { workers: workers.slice(0, 12) },
        updatedByUserId: user.id,
      },
    });
  }

  private boxSearchState(
    requestId: string,
    requiredBoxes: string[],
    foundBoxes: Set<string>,
    lastScan: null | { boxCode: string; matched: boolean; alreadyFound: boolean; matchedBox: string | null },
  ) {
    const foundNormalized = new Set([...foundBoxes].map(normalizeBoxCode));
    const boxes = requiredBoxes.map((code) => ({
      code,
      found: foundNormalized.has(normalizeBoxCode(code)),
    }));
    const foundCount = boxes.filter((box) => box.found).length;
    const missingBoxes = boxes.filter((box) => !box.found).map((box) => box.code);

    return {
      requestId,
      total: boxes.length,
      found: foundCount,
      remaining: missingBoxes.length,
      isComplete: missingBoxes.length === 0,
      boxes,
      missingBoxes,
      lastScan,
    };
  }
}

function boxSearchKey(requestId: string) {
  return `TSD_BOX_SEARCH:${requestId}`;
}

function requestWorkersKey(requestId: string) {
  return `TSD_REQUEST_WORKERS:${requestId}`;
}

function relabelKey(requestId: string) {
  return `TSD_RELABEL:${requestId}`;
}

function movesKey(requestId: string) {
  return `TSD_MOVES:${requestId}`;
}

function moveTaskId(sourceBox: string, barcode: string, article: string, size: string) {
  return Buffer.from([sourceBox, barcode, article, size].join('\u0001')).toString('base64url');
}

function balanceMoveRowKey(row: {
  sourceBox: string;
  artOnBox: string;
  barcodeOnBox: string;
  size: string;
  quantity: number;
}) {
  return [
    normalizeBoxCode(row.sourceBox),
    normalizeBoxCode(row.barcodeOnBox),
    (row.artOnBox || '').trim().toLowerCase(),
    (row.size || '').trim().toLowerCase(),
    row.quantity,
  ].join('\u0001');
}

function finalRequestBarcode(item: { barcode: string | null; comment: string | null }) {
  return parseCommentRelabelTarget(item.comment) || item.barcode || '';
}

function parseCommentRelabelTarget(comment: string | null) {
  if (!comment) {
    return '';
  }
  for (const part of comment.split(';')) {
    const [rawKey, ...rawValue] = part.split(':');
    if (rawKey.trim().toLowerCase() !== 'перемаркировка в') {
      continue;
    }
    const value = rawValue.join(':').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

type RelabelTask = {
  id: string;
  sourceBox: string;
  article: string;
  size: string;
  sourceBarcode: string;
  targetBarcode: string;
  quantity: number;
};

type MoveTask = {
  id: string;
  sourceBox: string;
  article: string;
  size: string;
  barcode: string;
  suggestedTargetBox: string;
  quantity: number;
};

type MoveState = {
  currentTargetBox: string;
  completed: Map<string, number>;
};

type RequestWorker = {
  userId: string;
  userName: string;
  deviceId: string;
  deviceCode: string;
  stage: string;
  lastSeenAt: string;
};

function parseRequestWorker(value: unknown): RequestWorker | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const userId = typeof payload.userId === 'string' ? payload.userId : '';
  const lastSeenAt = typeof payload.lastSeenAt === 'string' ? payload.lastSeenAt : '';
  if (!userId || !lastSeenAt || Number.isNaN(Date.parse(lastSeenAt))) {
    return null;
  }

  return {
    userId,
    userName: typeof payload.userName === 'string' ? payload.userName : 'ТСД',
    deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : '',
    deviceCode: typeof payload.deviceCode === 'string' ? payload.deviceCode : '',
    stage: typeof payload.stage === 'string' ? payload.stage : 'В работе',
    lastSeenAt,
  };
}

function normalizeWorkerDeviceCode(user: AuthUser, deviceCode?: string) {
  return (user.deviceCode ?? deviceCode ?? '').trim().toUpperCase();
}

function normalizeBoxCode(value: string) {
  return value.trim().toUpperCase();
}

function parseRelabelNote(value: string) {
  const match = value.match(/перемаркировать\s+(.+?)\s*->\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const sourceBarcode = match[1]?.trim();
  const targetBarcode = match[2]?.trim();
  return sourceBarcode && targetBarcode ? { sourceBarcode, targetBarcode } : null;
}

function relabelTaskId(sourceBox: string, sourceBarcode: string, targetBarcode: string, article: string, size: string) {
  return Buffer.from([sourceBox, sourceBarcode, targetBarcode, article, size].join('\u0001')).toString('base64url');
}

function normalizeTsdStage(stage?: string) {
  const normalized = stage?.trim().toLowerCase();
  if (normalized === 'relabel') {
    return 'relabel';
  }
  if (normalized === 'moves') {
    return 'moves';
  }
  return 'box-search';
}

function tsdStageLabel(stage?: string) {
  switch (normalizeTsdStage(stage)) {
    case 'relabel':
      return 'Перемаркировка';
    case 'moves':
      return 'Перемещения';
    default:
      return 'Поиск коробов';
  }
}
