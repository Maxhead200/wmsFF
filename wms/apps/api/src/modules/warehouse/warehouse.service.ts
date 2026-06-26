import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpsertBoxDto } from './dto/upsert-box.dto';
import { UpsertPalletDto } from './dto/upsert-pallet.dto';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  listWarehouses() {
    return this.prisma.warehouse.findMany({
      include: { zones: true },
      orderBy: { code: 'asc' },
    });
  }

  createWarehouse(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
      },
    });
  }

  listZones(warehouseId?: string) {
    return this.prisma.zone.findMany({
      where: { warehouseId },
      include: { warehouse: true },
      orderBy: [{ warehouseId: 'asc' }, { code: 'asc' }],
    });
  }

  createZone(dto: CreateZoneDto) {
    // Русский комментарий: зоны нужны уже в MVP, стеллажи оставляем как следующий уровень адресации.
    return this.prisma.zone.create({
      data: {
        warehouseId: dto.warehouseId,
        code: dto.code.trim(),
        name: dto.name.trim(),
      },
    });
  }

  listBoxes(filter: { clientId?: string; code?: string }, user: AuthUser) {
    const where: Prisma.BoxWhereInput = {
      clientId: this.clientScopes.resolveClientFilter(user, filter.clientId),
      code: filter.code ? { contains: filter.code, mode: 'insensitive' } : undefined,
    };

    return this.prisma.box.findMany({
      where,
      include: {
        client: true,
        zone: true,
        pallet: true,
        _count: { select: { balances: true, movements: true } },
      },
      orderBy: { code: 'asc' },
      take: 200,
    });
  }

  upsertBox(dto: UpsertBoxDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    return this.prisma.box.upsert({
      where: {
        clientId_code: {
          clientId: dto.clientId,
          code: dto.code.trim(),
        },
      },
      update: {
        zoneId: dto.zoneId,
        palletId: dto.palletId,
      },
      create: {
        clientId: dto.clientId,
        code: dto.code.trim(),
        zoneId: dto.zoneId,
        palletId: dto.palletId,
      },
      include: {
        zone: true,
        pallet: true,
      },
    });
  }

  listPallets(clientId: string | undefined, user: AuthUser) {
    return this.prisma.pallet.findMany({
      where: { clientId: this.clientScopes.resolveClientFilter(user, clientId) },
      include: {
        client: true,
        zone: true,
        boxes: true,
        _count: { select: { balances: true } },
      },
      orderBy: { code: 'asc' },
      take: 200,
    });
  }

  upsertPallet(dto: UpsertPalletDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');

    return this.prisma.pallet.upsert({
      where: {
        clientId_code: {
          clientId: dto.clientId,
          code: dto.code.trim(),
        },
      },
      update: {
        zoneId: dto.zoneId,
      },
      create: {
        clientId: dto.clientId,
        code: dto.code.trim(),
        zoneId: dto.zoneId,
      },
      include: {
        zone: true,
      },
    });
  }
}
