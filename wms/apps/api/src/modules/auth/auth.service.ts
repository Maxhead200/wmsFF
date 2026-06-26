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
      throw new UnauthorizedException('Неверный email или пароль.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Пользователь заблокирован.');
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
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roleCodes: user.roles.map((item) => item.role.code),
      permissionCodes: [
        ...new Set(user.roles.flatMap((item) => item.role.permissions.map((permission) => permission.permission.code))),
      ],
    };
  }

  private userAccessInclude() {
    return {
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
}
