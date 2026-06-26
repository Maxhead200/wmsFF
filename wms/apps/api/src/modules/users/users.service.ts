import { BadRequestException, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AccessModelService } from '../auth/access-model.service';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserClientScopesDto } from './dto/update-user-client-scopes.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessModel: AccessModelService,
    private readonly passwords: PasswordService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: this.userSummarySelect(),
    });
  }

  async create(dto: CreateUserDto) {
    const roles = await this.accessModel.resolveRoles(dto.roleCodes?.length ? dto.roleCodes : ['OPERATOR']);
    const clientScopes = this.buildCreateClientScopes(dto.clientIds, dto.writableClientIds);
    await this.ensureClientsExist(clientScopes.map((scope) => scope.clientId));

    // Русский комментарий: API никогда не возвращает passwordHash; пароль сохраняется только как scrypt hash.
    return this.prisma.user.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        name: dto.name.trim(),
        passwordHash: await this.passwords.hash(dto.password),
        roles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
        clientScopes: clientScopes.length
          ? {
              create: clientScopes,
            }
          : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        roles: {
          select: {
            role: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        clientScopes: {
          select: {
            canRead: true,
            canWrite: true,
            client: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async updateClientScopes(userId: string, dto: UpdateUserClientScopesDto) {
    const scopes = [...new Map(dto.scopes.map((scope) => [scope.clientId, scope])).values()].map((scope) => ({
      clientId: scope.clientId,
      canWrite: scope.canWrite ?? false,
      canRead: (scope.canRead ?? true) || (scope.canWrite ?? false),
    }));

    await this.ensureClientsExist(scopes.map((scope) => scope.clientId));

    await this.prisma.$transaction(async (tx) => {
      await tx.userClient.deleteMany({ where: { userId } });

      if (scopes.length > 0) {
        await tx.userClient.createMany({
          data: scopes.map((scope) => ({
            userId,
            ...scope,
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.findUserSummary(userId);
  }

  async updateRoles(userId: string, dto: UpdateUserRolesDto) {
    const roleCodes = this.normalizeRoleCodes(dto.roleCodes);
    if (roleCodes.length === 0) {
      throw new BadRequestException('Нужно выбрать хотя бы одну роль пользователя.');
    }

    const roles = await this.accessModel.resolveRoles(roleCodes);
    await this.ensureSystemAdminSurvives(userId, roles.map((role) => role.id));

    await this.prisma.$transaction(async (tx) => {
      await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true },
      });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({
          userId,
          roleId: role.id,
        })),
        skipDuplicates: true,
      });
    });

    return this.findUserSummary(userId);
  }

  async listRoles() {
    const roles = await this.accessModel.listRoles();
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      permissions: role.permissions.map((item) => ({
        code: item.permission.code,
        name: item.permission.name,
      })),
    }));
  }

  private buildCreateClientScopes(clientIds?: string[], writableClientIds?: string[]) {
    const readSet = new Set(clientIds ?? []);
    const writeSet = new Set(writableClientIds ?? []);
    writeSet.forEach((clientId) => readSet.add(clientId));

    return [...readSet].map((clientId) => ({
      clientId,
      canRead: true,
      canWrite: writeSet.has(clientId),
    }));
  }

  private async ensureClientsExist(clientIds: string[]) {
    const uniqueClientIds = [...new Set(clientIds)];
    if (uniqueClientIds.length === 0) {
      return;
    }

    const foundClients = await this.prisma.client.findMany({
      where: { id: { in: uniqueClientIds } },
      select: { id: true },
    });

    if (foundClients.length !== uniqueClientIds.length) {
      throw new BadRequestException('Один или несколько клиентов для scope не найдены.');
    }
  }

  private normalizeRoleCodes(roleCodes: string[]) {
    return [...new Set(roleCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  }

  private async ensureSystemAdminSurvives(userId: string, nextRoleIds: string[]) {
    const currentHasSystemAdmin = await this.prisma.userRole.count({
      where: {
        userId,
        role: {
          permissions: {
            some: {
              permission: { code: 'system:admin' },
            },
          },
        },
      },
    });

    if (currentHasSystemAdmin === 0) {
      return;
    }

    const nextHasSystemAdmin = await this.prisma.role.count({
      where: {
        id: { in: nextRoleIds },
        permissions: {
          some: {
            permission: { code: 'system:admin' },
          },
        },
      },
    });

    if (nextHasSystemAdmin > 0) {
      return;
    }

    const otherSystemAdmins = await this.prisma.user.count({
      where: {
        id: { not: userId },
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: { code: 'system:admin' },
                },
              },
            },
          },
        },
      },
    });

    if (otherSystemAdmins === 0) {
      throw new BadRequestException('Нельзя снять последнюю роль с полным административным доступом.');
    }
  }

  private findUserSummary(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: this.userSummarySelect(),
    });
  }

  private userSummarySelect() {
    return {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
      roles: {
        select: {
          role: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },
      clientScopes: {
        select: {
          canRead: true,
          canWrite: true,
          client: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    } as const;
  }
}
