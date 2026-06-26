import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VolumeService } from '../stock/volume.service';
import { CreateSkuDto } from './dto/create-sku.dto';

@Injectable()
export class SkusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly volumes: VolumeService,
  ) {}

  list(filter: { clientId?: string; search?: string }) {
    const where: Prisma.SkuWhereInput = {
      clientId: filter.clientId,
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

  async get(id: string) {
    const sku = await this.prisma.sku.findUnique({
      where: { id },
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

  async create(dto: CreateSkuDto) {
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
