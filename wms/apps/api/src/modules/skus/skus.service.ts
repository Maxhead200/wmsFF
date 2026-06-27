import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { VolumeService } from '../stock/volume.service';
import { CreateSkuDto } from './dto/create-sku.dto';
import {
  parseNomenclatureSheet,
  type NomenclatureImportItem,
  type SheetMatrix,
} from './nomenclature-xlsx.parser';

@Injectable()
export class SkusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
    private readonly volumes: VolumeService,
  ) {}

  list(filter: { clientId?: string; search?: string }, user: AuthUser) {
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

    return this.prisma.sku.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        barcodes: true,
        _count: { select: { balances: true, movements: true } },
      },
      take: 100,
    });
  }

  async get(id: string, user: AuthUser) {
    const sku = await this.prisma.sku.findFirst({
      where: {
        id,
        clientId: this.clientScopes.resolveClientFilter(user),
      },
      include: {
        barcodes: true,
        balances: true,
      },
    });

    if (!sku) {
      throw new NotFoundException('SKU не найден.');
    }

    return sku;
  }

  async create(dto: CreateSkuDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');
    const volume = this.tryCalculateVolume(dto);

    // Русский комментарий: карточка SKU и основной штрихкод создаются одной транзакцией, чтобы не ловить "висячие" barcode.
    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.sku.create({
        data: {
          clientId: dto.clientId,
          internalSku: dto.internalSku.trim(),
          clientSku: dto.clientSku?.trim(),
          article: dto.article?.trim(),
          name: dto.name.trim(),
          color: dto.color?.trim(),
          size: dto.size?.trim(),
          lengthCm: dto.lengthCm,
          widthCm: dto.widthCm,
          heightCm: dto.heightCm,
          volumeLiters: volume?.liters,
          volumeSource: volume ? 'CALCULATED' : 'MANUAL',
          needsChestnyZnak: dto.needsChestnyZnak ?? false,
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

      return tx.sku.findUniqueOrThrow({
        where: { id: sku.id },
        include: { barcodes: true },
      });
    });
  }

  async importWorkbook(file: Express.Multer.File, clientId: string, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, clientId, 'write');

    const rows = this.readFirstSheet(file.buffer);
    const parsed = parseNomenclatureSheet(rows, { clientId });
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
        const result = await this.upsertImportedSku(item);
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
      clientId,
      summary: {
        ...parsed.summary,
        ...counters,
      },
      issues: parsed.issues,
      skus: savedSkus,
    };
  }

  private async upsertImportedSku(item: NomenclatureImportItem) {
    const existingByBarcode = item.barcode
      ? await this.prisma.barcode.findFirst({
          where: {
            value: item.barcode,
            sku: { clientId: item.clientId },
          },
          include: { sku: true },
        })
      : null;

    const existingSku =
      existingByBarcode?.sku ??
      (await this.prisma.sku.findUnique({
        where: {
          clientId_internalSku: {
            clientId: item.clientId,
            internalSku: item.internalSku,
          },
        },
      }));

    const sku = existingSku
      ? await this.prisma.sku.update({
          where: { id: existingSku.id },
          data: this.importedSkuData(item),
          include: { barcodes: true },
        })
      : await this.prisma.sku.create({
          data: this.importedSkuData(item),
          include: { barcodes: true },
        });

    if (item.barcode) {
      await this.prisma.barcode.upsert({
        where: {
          skuId_value: {
            skuId: sku.id,
            value: item.barcode,
          },
        },
        update: { isPrimary: true },
        create: {
          skuId: sku.id,
          value: item.barcode,
          isPrimary: true,
        },
      });
    }

    return this.prisma.sku
      .findUniqueOrThrow({
        where: { id: sku.id },
        include: { barcodes: true },
      })
      .then((saved) => ({ sku: saved, created: !existingSku }));
  }

  private importedSkuData(item: NomenclatureImportItem): Prisma.SkuUncheckedCreateInput {
    return {
      clientId: item.clientId,
      internalSku: item.internalSku,
      clientSku: item.clientSku,
      article: item.article,
      name: item.name,
      color: item.color,
      size: item.size,
    };
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
}
