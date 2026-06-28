import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessModelService } from './access-model.service';
import { AccessTokenService } from './access-token.service';
import type { AuthUser } from './auth.types';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';

type UserWithAccess = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: UserStatus;
  clientScopes: Array<{ clientId: string; canRead: boolean; canWrite: boolean }>;
  printerScopes: Array<{ groupCode: string; canPrint: boolean; canManage: boolean }>;
  roles: Array<{
    role: {
      code: string;
      permissions: Array<{
        permission: {
          code: string;
        };
      }>;
    };
  }>;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accessModel: AccessModelService,
    private readonly passwords: PasswordService,
    private readonly tokens: AccessTokenService,
  ) {}

  async bootstrapAdmin(dto: BootstrapAdminDto) {
    this.assertBootstrapSecret(dto.bootstrapSecret);

    const usersCount = await this.prisma.user.count();
    if (usersCount > 0) {
      throw new BadRequestException('Первичный администратор уже создан.');
    }

    const [adminRole] = await this.accessModel.resolveRoles(['ADMIN']);
    const user = await this.prisma.user.create({
      data: {
        email: this.normalizeEmail(dto.email),
        name: dto.name.trim(),
        passwordHash: await this.passwords.hash(dto.password),
        roles: {
          create: [{ roleId: adminRole.id }],
        },
      },
      include: this.userAccessInclude(),
    });

    return this.authResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.findUserWithAccess(this.normalizeEmail(dto.email));
    if (!user || !(await this.passwords.verify(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Неверный логин или пароль.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Пользователь заблокирован.');
    }

    const maintenance = await this.getMaintenanceMode();
    if (maintenance.enabled && !this.isSystemAdmin(user)) {
      throw new UnauthorizedException(maintenance.message || 'Вход временно закрыт: в WMS идут сервисные работы.');
    }

    return this.authResponse(user);
  }

  private async findUserWithAccess(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: this.userAccessInclude(),
    });
  }

  private authResponse(user: UserWithAccess) {
    const authUser = this.toAuthUser(user);

    return {
      accessToken: this.tokens.sign(user.id),
      tokenType: 'Bearer',
      user: authUser,
    };
  }

  private toAuthUser(user: UserWithAccess): AuthUser {
    const roleCodes = user.roles.map((item) => item.role.code);
    const permissionCodes = [
      ...new Set(user.roles.flatMap((item) => item.role.permissions.map((permission) => permission.permission.code))),
    ];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roleCodes,
      permissionCodes,
      clientScopeMode: this.clientScopeMode(roleCodes, permissionCodes, user.clientScopes.length),
      clientIds: user.clientScopes.filter((scope) => scope.canRead).map((scope) => scope.clientId),
      writableClientIds: user.clientScopes.filter((scope) => scope.canWrite).map((scope) => scope.clientId),
      printerGroups: user.printerScopes.map((scope) => ({
        groupCode: scope.groupCode,
        canPrint: scope.canPrint,
        canManage: scope.canManage,
      })),
    };
  }

  private userAccessInclude() {
    return {
      clientScopes: true,
      printerScopes: true,
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    } as const;
  }

  private assertBootstrapSecret(input: string) {
    const expected = this.config.get<string>('BOOTSTRAP_ADMIN_SECRET');
    if (!expected || input !== expected) {
      throw new UnauthorizedException('Неверный bootstrap secret.');
    }
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async getMaintenanceMode() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'SYSTEM_MAINTENANCE' },
    });
    const value = setting?.value;

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { enabled: false, message: null as string | null };
    }

    const payload = value as { enabled?: unknown; message?: unknown };
    return {
      enabled: payload.enabled === true,
      message: typeof payload.message === 'string' ? payload.message : null,
    };
  }

  private isSystemAdmin(user: UserWithAccess) {
    return user.roles.some((item) =>
      item.role.permissions.some((permission) => permission.permission.code === 'system:admin'),
    );
  }

  private clientScopeMode(roleCodes: string[], permissionCodes: string[], clientScopesCount: number) {
    if (permissionCodes.includes('system:admin')) {
      return 'ALL';
    }

    if (!roleCodes.includes('CLIENT') && clientScopesCount === 0) {
      return 'ALL';
    }

    return 'LIMITED';
  }
}
