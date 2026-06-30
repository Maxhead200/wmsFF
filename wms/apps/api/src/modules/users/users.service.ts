import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AccessModelService } from '../auth/access-model.service';
import type { AuthUser } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserClientScopesDto } from './dto/update-user-client-scopes.dto';
import { UpdateUserPrinterScopesDto } from './dto/update-user-printer-scopes.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserTsdActivationCodeDto } from './dto/update-user-tsd-activation-code.dto';
import { normalizePrinterGroupCode } from '../auth/printer-scope.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessModel: AccessModelService,
    private readonly passwords: PasswordService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      where: { isDemo: false },
      orderBy: { createdAt: 'desc' },
      select: this.userSummarySelect(),
    });
    return users.map((user) => this.withTsdActivationCodeFlag(user));
  }

  async create(dto: CreateUserDto) {
    const roles = await this.accessModel.resolveRoles(dto.roleCodes?.length ? dto.roleCodes : ['OPERATOR']);
    const clientScopes = this.buildCreateClientScopes(dto.clientIds, dto.writableClientIds);
    await this.ensureClientsExist(clientScopes.map((scope) => scope.clientId));

    // Русский комментарий: API никогда не возвращает passwordHash; пароль сохраняется только как scrypt hash.
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        name: dto.name.trim(),
        passwordHash: await this.passwords.hash(dto.password),
        tsdActivationCodeHash: dto.tsdActivationCode ? await this.passwords.hash(dto.tsdActivationCode) : null,
        roles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
        clientScopes: clientScopes.length
          ? {
              create: clientScopes,
            }
          : undefined,
      },
      select: { id: true },
    });
    return this.findUserSummary(user.id);
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

  async updatePrinterScopes(userId: string, dto: UpdateUserPrinterScopesDto) {
    const scopes = [...new Map(dto.scopes.map((scope) => [normalizePrinterGroupCode(scope.groupCode), scope])).values()].map(
      (scope) => ({
        groupCode: normalizePrinterGroupCode(scope.groupCode),
        canManage: scope.canManage ?? false,
        canPrint: (scope.canPrint ?? true) || (scope.canManage ?? false),
      }),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true },
      });
      await tx.userPrinterGroup.deleteMany({ where: { userId } });

      if (scopes.length > 0) {
        await tx.userPrinterGroup.createMany({
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

  async updateTsdActivationCode(userId: string, dto: UpdateUserTsdActivationCodeDto) {
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tsdActivationCodeHash: dto.code ? await this.passwords.hash(dto.code) : null,
      },
    });

    return this.findUserSummary(userId);
  }

  async delete(userId: string, currentUser: AuthUser) {
    if (userId === currentUser.id) {
      throw new BadRequestException('Нельзя удалить собственную учетную запись.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: { code: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден.');
    }

    const hasSystemAdmin = user.roles.some((item) =>
      item.role.permissions.some((permission) => permission.permission.code === 'system:admin'),
    );
    if (hasSystemAdmin) {
      await this.ensureSystemAdminSurvives(userId, []);
    }

    const deletedEmail = `deleted-${Date.now()}-${user.email}`.slice(0, 180);
    await this.prisma.$transaction(async (tx) => {
      await tx.userSession.deleteMany({ where: { userId } });
      await tx.tsdDevice.deleteMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userClient.deleteMany({ where: { userId } });
      await tx.userPrinterGroup.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: deletedEmail,
          status: UserStatus.BLOCKED,
        },
      });
    });

    return { id: userId, deleted: true };
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

  private async findUserSummary(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: this.userSummarySelect(),
    });
    return this.withTsdActivationCodeFlag(user);
  }

  private userSummarySelect() {
    return {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
      tsdActivationCodeHash: true,
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
      printerScopes: {
        select: {
          groupCode: true,
          canPrint: true,
          canManage: true,
        },
      },
    } as const;
  }

  private withTsdActivationCodeFlag<T extends { tsdActivationCodeHash: string | null }>(user: T) {
    const { tsdActivationCodeHash, ...rest } = user;
    return {
      ...rest,
      hasTsdActivationCode: Boolean(tsdActivationCodeHash),
    };
  }
}
