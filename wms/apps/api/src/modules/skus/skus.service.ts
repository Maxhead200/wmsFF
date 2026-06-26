import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { VolumeService } from '../stock/volume.service';
import { CreateSkuDto } from './dto/create-sku.dto';

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
