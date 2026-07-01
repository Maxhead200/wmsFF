import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientNotificationEvent, ClientNotificationSeverity, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TelegramNotificationsService } from '../../common/telegram/telegram-notifications.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { isClientNotificationEnabled } from '../client-notifications/client-notification-preferences';
import { VolumeService } from '../stock/volume.service';
import { CreateArticleMappingDto } from './dto/create-article-mapping.dto';
import { CreateNomenclatureItemDto } from './dto/create-nomenclature-item.dto';
import { CreateSkuDto } from './dto/create-sku.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import {
  parseNomenclatureSheet,
  type NomenclatureImportItem,
  type SheetMatrix,
} from './nomenclature-xlsx.parser';

const EXPIRATION_WARNING_DAYS = 14;

@Injectable()
export class SkusService implements OnModuleInit, OnModuleDestroy {
  private expirationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
    private readonly volumes: VolumeService,
    private readonly telegram: TelegramNotificationsService,
  ) {}

  onModuleInit() {
    this.expirationTimer = setInterval(() => {
      void this.notifyExpirationAlertsInternal(undefined, EXPIRATION_WARNING_DAYS).catch(() => undefined);
    }, 24 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  async list(filter: { clientId?: string; search?: string }, user: AuthUser) {
    const where: Prisma.SkuWhereInput = {
      clientId: this.clientScopes.resolveClientFilter(user, filter.clientId),
      OR: filter.search
        ? [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { internalSku: { contains: filter.search, mode: 'insensitive' } },
            { barcodes: { some: { value: { contains: filter.search } } } },
          ]
        : undefined,
    };

    const skus = await this.prisma.sku.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: { select: { id: true, code: true, name: true } },
        barcodes: true,
        _count: { select: { balances: true, movements: true } },
      },
      take: 100,
    });

    return skus.map(enrichSkuMarketplaceData);
  }

  async get(id: string, user: AuthUser) {
    const sku = await this.prisma.sku.findFirst({
      where: {
        id,
        clientId: this.clientScopes.resolveClientFilter(user),
      },
      include: {
        client: { select: { id: true, code: true, name: true } },
        barcodes: true,
        balances: {
          include: {
            box: { select: { id: true, code: true, status: true } },
            pallet: { select: { id: true, code: true, status: true } },
          },
        },
        _count: { select: { balances: true, movements: true, clientRequestItems: true, packageItems: true, productMarks: true } },
      },
    });

    if (!sku) {
      throw new NotFoundException('SKU не найден.');
    }

    return enrichSkuMarketplaceData(sku);
  }

  async create(dto: CreateSkuDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');
    const volume = this.tryCalculateVolume(dto);

    // Русский комментарий: карточка SKU и основной штрихкод создаются одной транзакцией, чтобы не ловить "висячие" barcode.
    try {
      return await this.prisma.$transaction(async (tx) => {
        const sku = await tx.sku.create({
          data: {
            clientId: dto.clientId,
            internalSku: dto.internalSku.trim(),
            clientSku: cleanOptional(dto.clientSku),
            article: cleanOptional(dto.article),
            name: dto.name.trim(),
            brand: cleanOptional(dto.brand),
            category: cleanOptional(dto.category),
            color: cleanOptional(dto.color),
            size: cleanOptional(dto.size),
            weightGrams: dto.weightGrams ?? null,
            lengthCm: dto.lengthCm,
            widthCm: dto.widthCm,
            heightCm: dto.heightCm,
            shelfLifeUntil: parseShelfLifeUntil(dto.shelfLifeUntil),
            volumeLiters: volume?.liters,
            volumeSource: volume ? 'CALCULATED' : 'MANUAL',
            needsChestnyZnak: dto.needsChestnyZnak ?? false,
            isUnmarked: dto.isUnmarked ?? false,
            needsLabel: dto.needsLabel ?? false,
            needsRelabel: dto.needsRelabel ?? false,
            marketplacePayload: manualMarketplacePayload(dto.photoUrls),
          },
        });

        if (dto.barcode) {
          await tx.barcode.create({
            data: {
              skuId: sku.id,
              value: dto.barcode.trim(),
              isPrimary: true,
            },
          });
        }

        const saved = await tx.sku.findUniqueOrThrow({
          where: { id: sku.id },
          include: { barcodes: true },
        });

        return enrichSkuMarketplaceData(saved);
      });
    } catch (caught) {
      if (isUniqueConstraintError(caught)) {
        throw new BadRequestException('Такой SKU или штрихкод уже есть у клиента.');
      }

      throw caught;
    }
  }

  async update(id: string, dto: UpdateSkuDto, user: AuthUser) {
    const existing = await this.prisma.sku.findFirst({
      where: {
        id,
        clientId: this.clientScopes.resolveClientFilter(user),
      },
      include: { barcodes: true },
    });

    if (!existing) {
      throw new NotFoundException('SKU не найден.');
    }

    this.clientScopes.requireClientAccess(user, existing.clientId, 'write');
    if (dto.clientId && dto.clientId !== existing.clientId) {
      throw new BadRequestException('Нельзя перенести SKU к другому клиенту через редактирование карточки.');
    }

    const updateData = this.buildSkuUpdateData(dto, existing);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.sku.update({
          where: { id },
          data: updateData,
        });

        if (dto.barcode !== undefined) {
          await tx.barcode.deleteMany({ where: { skuId: id, isPrimary: true } });
          const barcode = cleanOptional(dto.barcode);
          if (barcode) {
            await tx.barcode.upsert({
              where: {
                skuId_value: {
                  skuId: id,
                  value: barcode,
                },
              },
              update: { isPrimary: true },
              create: {
                skuId: id,
                value: barcode,
                isPrimary: true,
              },
            });
          }
        }

        const updated = await tx.sku.findUniqueOrThrow({
          where: { id },
          include: {
            barcodes: true,
            balances: {
              include: {
                box: { select: { id: true, code: true, status: true } },
                pallet: { select: { id: true, code: true, status: true } },
              },
            },
            _count: { select: { balances: true, movements: true, clientRequestItems: true, packageItems: true, productMarks: true } },
          },
        });

        return enrichSkuMarketplaceData(updated);
      });
    } catch (caught) {
      if (isUniqueConstraintError(caught)) {
        throw new BadRequestException('Такой SKU или штрихкод уже есть у клиента.');
      }

      throw caught;
    }
  }

  async delete(id: string, user: AuthUser) {
    const existing = await this.prisma.sku.findFirst({
      where: {
        id,
        clientId: this.clientScopes.resolveClientFilter(user),
      },
      select: {
        id: true,
        clientId: true,
        internalSku: true,
        name: true,
        _count: {
          select: {
            balances: true,
            movements: true,
            clientRequestItems: true,
            packageItems: true,
            productMarks: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('SKU не найден.');
    }

    this.clientScopes.requireClientAccess(user, existing.clientId, 'write');

    const linkedRecords =
      existing._count.balances +
      existing._count.movements +
      existing._count.clientRequestItems +
      existing._count.packageItems +
      existing._count.productMarks;
    if (linkedRecords > 0) {
      throw new BadRequestException(
        'Нельзя удалить SKU, который уже участвует в остатках, движениях, заявках или маркировке. Сначала очистите связанные операции.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.barcode.deleteMany({ where: { skuId: id } }),
      this.prisma.sku.delete({ where: { id } }),
    ]);

    return { id, internalSku: existing.internalSku, name: existing.name, deleted: true };
  }

  listNomenclature(filter: { search?: string }) {
    const where: Prisma.NomenclatureItemWhereInput = filter.search
      ? {
          OR: [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { printName: { contains: filter.search, mode: 'insensitive' } },
            { internalSku: { contains: filter.search, mode: 'insensitive' } },
            { article: { contains: filter.search, mode: 'insensitive' } },
            { barcode: { contains: filter.search } },
          ],
        }
      : {};

    return this.prisma.nomenclatureItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async createNomenclature(dto: CreateNomenclatureItemDto) {
    const internalSku = this.buildNomenclatureInternalSku(dto);

    try {
      return await this.prisma.nomenclatureItem.create({
        data: {
          internalSku,
          article: cleanOptional(dto.article),
          barcode: cleanOptional(dto.barcode),
          name: dto.name.trim(),
          printName: cleanOptional(dto.printName),
          unit: cleanOptional(dto.unit),
          itemType: cleanOptional(dto.itemType),
          color: cleanOptional(dto.color),
          size: cleanOptional(dto.size),
          needsChestnyZnak: dto.needsChestnyZnak ?? false,
        },
      });
    } catch (caught) {
      if (isUniqueConstraintError(caught)) {
        throw new BadRequestException('Такая номенклатура или штрихкод уже есть в общем справочнике.');
      }

      throw caught;
    }
  }

  async listArticleMappings(clientId: string, user: AuthUser) {
    if (!clientId) {
      throw new BadRequestException('Не выбран клиент для справочника соответствий.');
    }

    this.clientScopes.requireClientAccess(user, clientId, 'read');

    return this.prisma.clientArticleMapping.findMany({
      where: { clientId },
      orderBy: [{ targetArticle: 'asc' }, { sourceArticle: 'asc' }],
    });
  }

  async createArticleMapping(dto: CreateArticleMappingDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    try {
      return await this.prisma.clientArticleMapping.upsert({
        where: {
          clientId_sourceArticle_targetArticle: {
            clientId: dto.clientId,
            sourceArticle: dto.sourceArticle.trim(),
            targetArticle: dto.targetArticle.trim(),
          },
        },
        create: {
          clientId: dto.clientId,
          sourceArticle: dto.sourceArticle.trim(),
          targetArticle: dto.targetArticle.trim(),
          comment: cleanOptional(dto.comment),
        },
        update: {
          comment: cleanOptional(dto.comment),
        },
      });
    } catch (caught) {
      if (isUniqueConstraintError(caught)) {
        throw new BadRequestException('Такое соответствие уже есть в справочнике клиента.');
      }

      throw caught;
    }
  }

  async importArticleMappingsWorkbook(clientId: string, file: Express.Multer.File, user: AuthUser) {
    if (!clientId) {
      throw new BadRequestException('Не выбран клиент для импорта соответствий.');
    }

    this.clientScopes.requireClientAccess(user, clientId, 'write');
    const rows = this.readFirstSheet(file.buffer);
    const parsed = parseArticleMappingSheet(rows);

    if (parsed.items.length === 0) {
      throw new BadRequestException({
        message: 'В файле не найдено соответствий для загрузки.',
        errors: parsed.issues.filter((issue) => issue.severity === 'error'),
        summary: parsed.summary,
      });
    }

    const counters = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: parsed.issues.filter((issue) => issue.severity === 'error').length,
      warnings: parsed.issues.filter((issue) => issue.severity === 'warning').length,
    };
    const savedMappings = [];

    for (const item of parsed.items) {
      try {
        const existing = await this.prisma.clientArticleMapping.findUnique({
          where: {
            clientId_sourceArticle_targetArticle: {
              clientId,
              sourceArticle: item.sourceArticle,
              targetArticle: item.targetArticle,
            },
          },
        });
        const mapping = await this.prisma.clientArticleMapping.upsert({
          where: {
            clientId_sourceArticle_targetArticle: {
              clientId,
              sourceArticle: item.sourceArticle,
              targetArticle: item.targetArticle,
            },
          },
          create: {
            clientId,
            sourceArticle: item.sourceArticle,
            targetArticle: item.targetArticle,
            comment: item.comment,
          },
          update: {
            comment: item.comment,
          },
        });
        counters[existing ? 'updated' : 'created'] += 1;
        savedMappings.push(mapping);
      } catch (caught) {
        counters.skipped += 1;
        counters.errors += 1;
        parsed.issues.push({
          row: item.sourceRow,
          message: caught instanceof Error ? caught.message : 'Не удалось сохранить соответствие.',
          severity: 'error',
        });
      }
    }

    return {
      fileName: file.originalname,
      summary: {
        ...parsed.summary,
        ...counters,
      },
      issues: parsed.issues,
      items: savedMappings,
    };
  }

  async importNomenclatureWorkbook(file: Express.Multer.File) {
    const rows = this.readFirstSheet(file.buffer);
    const parsed = parseNomenclatureSheet(rows);
    const errors = parsed.issues.filter((issue) => issue.severity === 'error');

    if (parsed.items.length === 0) {
      throw new BadRequestException({
        message: 'В файле не найдена номенклатура для загрузки.',
        errors,
        summary: parsed.summary,
      });
    }

    const counters = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: errors.length,
      warnings: parsed.issues.filter((issue) => issue.severity === 'warning').length,
    };
    const savedSkus = [];

    for (const item of parsed.items) {
      try {
        const result = await this.upsertImportedNomenclature(item);
        counters[result.created ? 'created' : 'updated'] += 1;
        savedSkus.push(result.sku);
      } catch (caught) {
        counters.skipped += 1;
        counters.errors += 1;
        parsed.issues.push({
          row: item.sourceRow,
          internalSku: item.internalSku,
          name: item.name,
          message: caught instanceof Error ? caught.message : 'Не удалось сохранить строку номенклатуры.',
          severity: 'error',
        });
      }
    }

    return {
      fileName: file.originalname,
      summary: {
        ...parsed.summary,
        ...counters,
      },
      issues: parsed.issues,
      items: savedSkus,
    };
  }

  private async upsertImportedNomenclature(item: NomenclatureImportItem) {
    const existingByBarcode = item.barcode
      ? await this.prisma.nomenclatureItem.findUnique({
          where: { barcode: item.barcode },
        })
      : null;

    const existingSku =
      existingByBarcode ??
      (await this.prisma.nomenclatureItem.findUnique({
        where: { internalSku: item.internalSku },
      }));

    const sku = existingSku
      ? await this.prisma.nomenclatureItem.update({
          where: { id: existingSku.id },
          data: this.importedNomenclatureData(item),
        })
      : await this.prisma.nomenclatureItem.create({
          data: this.importedNomenclatureData(item),
        });

    return { sku, created: !existingSku };
  }

  private importedNomenclatureData(item: NomenclatureImportItem): Prisma.NomenclatureItemUncheckedCreateInput {
    return {
      internalSku: item.internalSku,
      article: item.article,
      barcode: item.barcode,
      name: item.name,
      printName: item.printName,
      unit: item.unit,
      itemType: item.itemType,
      color: item.color,
      size: item.size,
    };
  }

  private buildNomenclatureInternalSku(dto: CreateNomenclatureItemDto) {
    return (dto.internalSku || dto.article || dto.barcode || dto.name).trim().slice(0, 100);
  }

  private readFirstSheet(buffer: Buffer): SheetMatrix {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json<SheetMatrix[number]>(worksheet, {
      header: 1,
      raw: false,
      blankrows: false,
    });
  }

  private buildSkuUpdateData(
    dto: UpdateSkuDto,
    existing: {
      internalSku: string;
      clientSku: string | null;
      article: string | null;
      name: string;
      brand: string | null;
      category: string | null;
      color: string | null;
      size: string | null;
      weightGrams: number | null;
      lengthCm: Prisma.Decimal | null;
      widthCm: Prisma.Decimal | null;
      heightCm: Prisma.Decimal | null;
      shelfLifeUntil: Date | null;
      needsChestnyZnak: boolean;
      isUnmarked: boolean;
      needsLabel: boolean;
      needsRelabel: boolean;
      marketplacePayload: Prisma.JsonValue | null;
    },
  ): Prisma.SkuUncheckedUpdateInput {
    const nextLength = dto.lengthCm ?? decimalToNumber(existing.lengthCm);
    const nextWidth = dto.widthCm ?? decimalToNumber(existing.widthCm);
    const nextHeight = dto.heightCm ?? decimalToNumber(existing.heightCm);
    const volume =
      nextLength && nextWidth && nextHeight
        ? this.volumes.calculateLiters({
            lengthCm: nextLength,
            widthCm: nextWidth,
            heightCm: nextHeight,
          })
        : null;

    return {
      ...(dto.internalSku === undefined ? {} : { internalSku: dto.internalSku.trim() }),
      ...(dto.clientSku === undefined ? {} : { clientSku: cleanOptional(dto.clientSku) ?? null }),
      ...(dto.article === undefined ? {} : { article: cleanOptional(dto.article) ?? null }),
      ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
      ...(dto.brand === undefined ? {} : { brand: cleanOptional(dto.brand) ?? null }),
      ...(dto.category === undefined ? {} : { category: cleanOptional(dto.category) ?? null }),
      ...(dto.color === undefined ? {} : { color: cleanOptional(dto.color) ?? null }),
      ...(dto.size === undefined ? {} : { size: cleanOptional(dto.size) ?? null }),
      ...(dto.weightGrams === undefined ? {} : { weightGrams: dto.weightGrams || null }),
      ...(dto.lengthCm === undefined ? {} : { lengthCm: dto.lengthCm ?? null }),
      ...(dto.widthCm === undefined ? {} : { widthCm: dto.widthCm ?? null }),
      ...(dto.heightCm === undefined ? {} : { heightCm: dto.heightCm ?? null }),
      ...(dto.shelfLifeUntil === undefined ? {} : { shelfLifeUntil: parseShelfLifeUntil(dto.shelfLifeUntil) }),
      ...(volume ? { volumeLiters: volume.liters, volumeSource: 'CALCULATED' } : {}),
      ...(dto.needsChestnyZnak === undefined ? {} : { needsChestnyZnak: dto.needsChestnyZnak }),
      ...(dto.isUnmarked === undefined ? {} : { isUnmarked: dto.isUnmarked }),
      ...(dto.needsLabel === undefined ? {} : { needsLabel: dto.needsLabel }),
      ...(dto.needsRelabel === undefined ? {} : { needsRelabel: dto.needsRelabel }),
      ...(dto.photoUrls === undefined ? {} : { marketplacePayload: mergeManualPhotos(existing.marketplacePayload, dto.photoUrls) }),
    };
  }

  private tryCalculateVolume(dto: CreateSkuDto) {
    if (!dto.lengthCm || !dto.widthCm || !dto.heightCm) {
      return null;
    }

    return this.volumes.calculateLiters({
      lengthCm: dto.lengthCm,
      widthCm: dto.widthCm,
      heightCm: dto.heightCm,
    });
  }

  async notifyExpirationAlerts(filter: { clientId?: string; days?: number }, user: AuthUser) {
    const days = clampExpirationDays(filter.days);
    const whereClientId = this.clientScopes.resolveClientFilter(user, filter.clientId);

    return this.notifyExpirationAlertsInternal(whereClientId, days, user.id);
  }

  private async notifyExpirationAlertsInternal(
    whereClientId: string | { in: string[] } | undefined,
    days = EXPIRATION_WARNING_DAYS,
    createdByUserId?: string | null,
  ) {
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const skus = await this.prisma.sku.findMany({
      where: {
        clientId: whereClientId,
        shelfLifeUntil: {
          lte: threshold,
        },
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        balances: {
          select: {
            quantity: true,
          },
        },
        barcodes: true,
      },
      orderBy: [{ client: { name: 'asc' } }, { shelfLifeUntil: 'asc' }],
    });

    const activeSkus = skus.filter((sku) => sku.shelfLifeUntil && sku.balances.reduce((sum, balance) => sum + balance.quantity, 0) > 0);
    const byClient = new Map<string, typeof activeSkus>();
    for (const sku of activeSkus) {
      const rows = byClient.get(sku.clientId) ?? [];
      rows.push(sku);
      byClient.set(sku.clientId, rows);
    }

    const created: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [clientId, rows] of byClient.entries()) {
      if (!(await isClientNotificationEnabled(this.prisma, clientId, ClientNotificationEvent.SKU_EXPIRATION))) {
        continue;
      }

      const expired = rows.filter((sku) => expirationInfo(sku.shelfLifeUntil).status === 'EXPIRED');
      const ending = rows.filter((sku) => expirationInfo(sku.shelfLifeUntil).status === 'ENDING_SOON');
      const title = expired.length > 0 ? 'Есть товары с истекшим сроком годности' : 'Подходит срок годности товаров';
      const body = [
        `Клиент: ${rows[0]?.client.name ?? '-'}`,
        `Истек срок: ${expired.length}`,
        `Заканчивается за ${days} дней: ${ending.length}`,
        ...rows.slice(0, 12).map((sku) => {
          const info = expirationInfo(sku.shelfLifeUntil);
          const quantity = sku.balances.reduce((sum, balance) => sum + balance.quantity, 0);
          return `${sku.name} (${primaryBarcodeValue(sku.barcodes) || sku.internalSku}) - ${formatDate(info.date)}; остаток ${quantity} шт.`;
        }),
        rows.length > 12 ? `Еще позиций: ${rows.length - 12}` : '',
      ].filter(Boolean).join('\n');

      const alreadySent = await this.prisma.clientNotification.findFirst({
        where: {
          clientId,
          title,
          createdAt: { gte: today },
        },
        select: { id: true },
      });
      if (alreadySent) {
        continue;
      }

      const notification = await this.prisma.clientNotification.create({
        data: {
          clientId,
          title,
          body,
          severity: expired.length > 0 ? ClientNotificationSeverity.ERROR : ClientNotificationSeverity.WARNING,
          createdByUserId: createdByUserId ?? undefined,
        },
      });
      created.push(notification.id);
      void this.telegram.notifyClientNotification(notification.id);
    }

    return {
      checked: activeSkus.length,
      clients: byClient.size,
      notificationsCreated: created.length,
    };
  }
}

function cleanOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function cleanPhotoUrls(photoUrls?: string[]) {
  return uniqueValues(
    (photoUrls ?? [])
      .map((photo) => photo.trim())
      .filter((photo) => photo && looksLikeImageUrl(photo)),
  ).slice(0, 12);
}

function manualMarketplacePayload(photoUrls?: string[]): Prisma.InputJsonValue | undefined {
  const manualPhotos = cleanPhotoUrls(photoUrls);
  return manualPhotos.length > 0 ? { manualPhotos } : undefined;
}

function mergeManualPhotos(payload: Prisma.JsonValue | null, photoUrls?: string[]): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const manualPhotos = cleanPhotoUrls(photoUrls);
  const base = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...(payload as Record<string, Prisma.JsonValue>) } : {};
  if (manualPhotos.length === 0) {
    delete base.manualPhotos;
    return Object.keys(base).length > 0 ? (base as Prisma.InputJsonObject) : Prisma.JsonNull;
  }

  return { ...base, manualPhotos };
}

function enrichSkuMarketplaceData<T extends { marketplacePayload: Prisma.JsonValue | null; shelfLifeUntil?: Date | null }>(sku: T) {
  return {
    ...sku,
    shelfLifeStatus: expirationInfo(sku.shelfLifeUntil),
    marketplacePhotos: extractMarketplacePhotos(sku.marketplacePayload),
    marketplaceCharacteristics: extractMarketplaceCharacteristics(sku.marketplacePayload),
  };
}

function parseShelfLifeUntil(value?: string | null) {
  if (value === null) {
    return null;
  }
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 23, 59, 59, 999));
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function expirationInfo(value?: Date | string | null) {
  if (!value) {
    return {
      status: 'NONE',
      date: null,
      daysLeft: null,
      label: 'Срок годности не указан',
    };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      status: 'NONE',
      date: null,
      daysLeft: null,
      label: 'Срок годности не указан',
    };
  }
  const now = new Date();
  const daysLeft = Math.ceil((endOfDay(date).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) {
    return {
      status: 'EXPIRED',
      date: date.toISOString(),
      daysLeft,
      label: 'Срок годности истек',
    };
  }
  if (daysLeft <= EXPIRATION_WARNING_DAYS) {
    return {
      status: 'ENDING_SOON',
      date: date.toISOString(),
      daysLeft,
      label: `Срок заканчивается через ${daysLeft} дн.`,
    };
  }
  return {
    status: 'OK',
    date: date.toISOString(),
    daysLeft,
    label: `Срок годности до ${formatDate(date)}`,
  };
}

function extractMarketplacePhotos(payload: Prisma.JsonValue | null) {
  const photos: string[] = [];

  visitMarketplacePayload(payload, (value, key) => {
    const normalizedKey = key.toLowerCase();
    if (typeof value === 'string' && looksLikeImageUrl(value)) {
      photos.push(value);
      return;
    }

    if (!['photo', 'photos', 'image', 'images', 'picture', 'pictures', 'media', 'primary_image'].some((name) => normalizedKey.includes(name))) {
      return;
    }

    if (typeof value === 'string' && looksLikeImageUrl(value)) {
      photos.push(value);
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, Prisma.JsonValue>;
      for (const field of ['url', 'big', 'small', 'file_name', 'link', 'c246x328', 'c516x688', 'hq', 'tm']) {
        const candidate = record[field];
        if (typeof candidate === 'string' && looksLikeImageUrl(candidate)) {
          photos.push(candidate);
        }
      }
    }
  });

  return uniqueValues(photos).slice(0, 60);
}

function extractMarketplaceCharacteristics(payload: Prisma.JsonValue | null) {
  const characteristics: Array<{ name: string; value: string }> = [];

  visitMarketplacePayload(payload, (value, key) => {
    const normalizedKey = key.toLowerCase();
    if (!['characteristic', 'characteristics', 'attribute', 'attributes', 'dimensions'].some((name) => normalizedKey.includes(name))) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const property = characteristicFromValue(item);
        if (property) {
          characteristics.push(property);
        }
      }
      return;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, Prisma.JsonValue>;
      const direct = characteristicFromValue(record);
      if (direct) {
        characteristics.push(direct);
        return;
      }

      for (const [name, propertyValue] of Object.entries(record)) {
        if (propertyValue == null || typeof propertyValue === 'object') {
          continue;
        }
        characteristics.push({ name, value: String(propertyValue) });
      }
    }
  });

  const seen = new Set<string>();
  return characteristics
    .filter((item) => {
      const key = `${item.name}:${item.value}`.toLowerCase();
      if (!item.name || !item.value || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 120);
}

function visitMarketplacePayload(
  value: Prisma.JsonValue | null,
  visitor: (value: Prisma.JsonValue, key: string) => void,
  key = '',
  depth = 0,
) {
  if (value == null || depth > 7) {
    return;
  }

  visitor(value, key);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitMarketplacePayload(item, visitor, String(index), depth + 1));
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, Prisma.JsonValue>).forEach(([nextKey, nextValue]) =>
      visitMarketplacePayload(nextValue, visitor, nextKey, depth + 1),
    );
  }
}

function characteristicFromValue(value: Prisma.JsonValue): { name: string; value: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, Prisma.JsonValue>;
  const name = textFromJson(record.name) || textFromJson(record.charcName) || textFromJson(record.attribute_name) || textFromJson(record.title);
  if (!name) {
    return null;
  }

  const rawValue = record.value ?? record.values ?? record.val ?? record.display_value;
  const normalizedValue = Array.isArray(rawValue)
    ? rawValue
        .map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? textFromJson((item as Record<string, Prisma.JsonValue>).value) : textFromJson(item)))
        .filter(Boolean)
        .join(', ')
    : textFromJson(rawValue);

  return normalizedValue ? { name, value: normalizedValue } : null;
}

function textFromJson(value: Prisma.JsonValue | undefined) {
  if (value == null || typeof value === 'object') {
    return '';
  }

  return String(value).trim();
}

function looksLikeImageUrl(value: string) {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  if (/\.(avif|gif|jpe?g|png|webp)([?#].*)?$/i.test(trimmed)) {
    return true;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const isWildberriesCdn = host.includes('wbbasket') || host.includes('wbstatic') || host.includes('wildberries');
    return isWildberriesCdn && /(image|img|photo|picture|pic|media)/i.test(path);
  } catch {
    return false;
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function primaryBarcodeValue(barcodes: Array<{ value: string; isPrimary: boolean }>) {
  return barcodes.find((barcode) => barcode.isPrimary)?.value ?? barcodes[0]?.value ?? '';
}

function clampExpirationDays(value?: number) {
  if (!Number.isFinite(value)) {
    return EXPIRATION_WARNING_DAYS;
  }
  return Math.max(1, Math.min(180, Math.round(Number(value))));
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return '-';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleDateString('ru-RU');
}

function decimalToNumber(value: Prisma.Decimal | null) {
  return value ? value.toNumber() : undefined;
}

type ArticleMappingImportItem = {
  sourceArticle: string;
  targetArticle: string;
  comment?: string;
  sourceRow: number;
};

type ArticleMappingImportIssue = {
  row: number;
  message: string;
  severity: 'warning' | 'error';
};

function parseArticleMappingSheet(rows: SheetMatrix) {
  const columns = detectArticleMappingColumns(rows);
  const items: ArticleMappingImportItem[] = [];
  const issues: ArticleMappingImportIssue[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, index) => {
    const sourceRow = index + 1;
    if (looksLikeArticleMappingHeader(row)) {
      return;
    }

    const sourceArticle = cleanImportText(row[columns.sourceArticle]);
    const targetArticle = cleanImportText(row[columns.targetArticle]);
    const comment = cleanImportText(row[columns.comment]);

    if (!sourceArticle && !targetArticle) {
      return;
    }

    if (!sourceArticle || !targetArticle) {
      issues.push({
        row: sourceRow,
        message: 'Нужно заполнить артикул на складе и артикул продавца.',
        severity: 'error',
      });
      return;
    }

    const dedupeKey = `${sourceArticle}|${targetArticle}`;
    if (seenKeys.has(dedupeKey)) {
      issues.push({
        row: sourceRow,
        message: 'Дубль соответствия в файле, строка пропущена.',
        severity: 'warning',
      });
      return;
    }

    seenKeys.add(dedupeKey);
    items.push({
      sourceArticle,
      targetArticle,
      comment: comment || undefined,
      sourceRow,
    });
  });

  return {
    items,
    issues,
    summary: {
      sourceRows: Math.max(rows.length - 1, 0),
      rows: items.length,
    },
  };
}

function detectArticleMappingColumns(rows: SheetMatrix) {
  for (const row of rows) {
    const normalized = row.map((cell) => normalizeImportHeader(cleanImportText(cell)));
    if (!normalized.some((cell) => cell.includes('артикул') || cell.includes('article'))) {
      continue;
    }

    return {
      sourceArticle:
        findImportColumn(normalized, ['артикул на складе', 'склад', 'исходный', 'старый', 'спортивный', 'source']) ?? 0,
      targetArticle:
        findImportColumn(normalized, ['артикул продавца', 'продавца', 'базовый', 'новый', 'target']) ?? 1,
      comment: findImportColumn(normalized, ['комментарий', 'примечание', 'comment']) ?? 2,
    };
  }

  return {
    sourceArticle: 0,
    targetArticle: 1,
    comment: 2,
  };
}

function looksLikeArticleMappingHeader(row: SheetMatrix[number]) {
  const normalized = row.map((cell) => normalizeImportHeader(cleanImportText(cell)));
  return normalized.some((cell) => cell.includes('артикул') || cell.includes('article'));
}

function findImportColumn(cells: string[], needles: string[]) {
  const index = cells.findIndex((cell) => needles.some((needle) => cell.includes(needle)));
  return index >= 0 ? index : undefined;
}

function cleanImportText(value: SheetMatrix[number][number]) {
  if (value == null) {
    return '';
  }
  const text = String(value).replace(/\.0$/, '').trim();
  return text === '#N/A' || text.toUpperCase() === 'N/A' ? '' : text;
}

function normalizeImportHeader(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
