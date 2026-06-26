import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const permissions = [
  ['system:admin', 'Полный административный доступ'],
  ['users:read', 'Просмотр пользователей и ролей'],
  ['users:write', 'Создание и изменение пользователей'],
  ['clients:read', 'Просмотр клиентов'],
  ['clients:write', 'Создание и изменение клиентов'],
  ['skus:read', 'Просмотр SKU'],
  ['skus:write', 'Создание и изменение SKU'],
  ['warehouse:read', 'Просмотр складской структуры'],
  ['warehouse:write', 'Изменение коробов, паллет и зон'],
  ['stock:read', 'Просмотр остатков'],
  ['stock:write', 'Складские операции и ledger'],
  ['imports:write', 'Загрузка XLSX-импортов'],
  ['logistics:read', 'Просмотр тарифов и расчет логистики'],
  ['logistics:write', 'Загрузка и изменение тарифов логистики'],
  ['print:write', 'Печать этикеток'],
] as const;

const rolePermissions: Record<string, { name: string; permissions: string[] }> = {
  ADMIN: {
    name: 'Администратор',
    permissions: ['system:admin'],
  },
  MANAGER: {
    name: 'Менеджер фулфилмента',
    permissions: [
      'users:read',
      'clients:read',
      'clients:write',
      'skus:read',
      'skus:write',
      'warehouse:read',
      'warehouse:write',
      'stock:read',
      'stock:write',
      'imports:write',
      'logistics:read',
      'logistics:write',
      'print:write',
    ],
  },
  OPERATOR: {
    name: 'Оператор склада',
    permissions: [
      'clients:read',
      'skus:read',
      'warehouse:read',
      'warehouse:write',
      'stock:read',
      'stock:write',
      'imports:write',
      'logistics:read',
      'print:write',
    ],
  },
  CLIENT: {
    name: 'Клиент',
    permissions: ['stock:read', 'logistics:read'],
  },
};

@Injectable()
export class AccessModelService {
  constructor(private readonly prisma: PrismaService) {}

  async seedDefaultAccessModel() {
    for (const [code, name] of permissions) {
      await this.prisma.permission.upsert({
        where: { code },
        update: { name },
        create: { code, name },
      });
    }

    for (const [code, role] of Object.entries(rolePermissions)) {
      const savedRole = await this.prisma.role.upsert({
        where: { code },
        update: { name: role.name },
        create: { code, name: role.name },
      });

      const savedPermissions = await this.prisma.permission.findMany({
        where: { code: { in: role.permissions } },
      });

      // Русский комментарий: createMany с skipDuplicates делает bootstrap повторяемым и безопасным для деплоя.
      await this.prisma.rolePermission.createMany({
        data: savedPermissions.map((permission) => ({
          roleId: savedRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  async listRoles() {
    await this.seedDefaultAccessModel();

    return this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async resolveRoles(roleCodes: string[]) {
    await this.seedDefaultAccessModel();

    const normalized = [...new Set(roleCodes.map((code) => code.trim().toUpperCase()))];
    const roles = await this.prisma.role.findMany({
      where: { code: { in: normalized } },
    });

    if (roles.length !== normalized.length) {
      throw new BadRequestException('Одна или несколько ролей не найдены.');
    }

    return roles;
  }
}
