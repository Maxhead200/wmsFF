import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { TsdDeviceStatus, UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessTokenService } from '../auth/access-token.service';
import { PasswordService } from '../auth/password.service';
import { CreateTsdDeviceDto } from './dto/create-tsd-device.dto';
import { LoginTsdDeviceDto } from './dto/login-tsd-device.dto';

const TSD_DEVICE_LIMIT_KEY = 'TSD_DEVICE_LIMIT';
const DEFAULT_TSD_DEVICE_LIMIT = 4;

@Injectable()
export class TsdDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: AccessTokenService,
  ) {}

  listDevices() {
    return this.prisma.tsdDevice.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        lastLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  async createDevice(dto: CreateTsdDeviceDto) {
    await this.assertCanCreateActiveDevice();

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: {
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
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Для ТСД нужен активный пользователь-оператор.');
    }

    const permissionCodes = user.roles.flatMap((item) =>
      item.role.permissions.map((permission) => permission.permission.code),
    );
    if (!permissionCodes.includes('stock:write') && !permissionCodes.includes('system:admin')) {
      throw new BadRequestException('Пользователь ТСД должен иметь право stock:write.');
    }

    const secret = this.generateSecret();
    const device = await this.prisma.tsdDevice.create({
      data: {
        code: this.normalizeCode(dto.code),
        name: dto.name.trim(),
        userId: user.id,
        secretHash: await this.passwords.hash(secret),
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        userId: true,
        createdAt: true,
      },
    });

    // Русский комментарий: секрет показываем только один раз при создании устройства; в базе остается только hash.
    return {
      ...device,
      deviceSecret: secret,
    };
  }

  async getDeviceSettings() {
    const [settings, activeDevices, totalDevices] = await Promise.all([
      this.resolveDeviceLimit(),
      this.prisma.tsdDevice.count({ where: { status: TsdDeviceStatus.ACTIVE } }),
      this.prisma.tsdDevice.count(),
    ]);

    return {
      maxActiveDevices: settings.maxActiveDevices,
      activeDevices,
      totalDevices,
      defaultLimit: DEFAULT_TSD_DEVICE_LIMIT,
      updatedAt: settings.updatedAt,
      updatedByUserId: settings.updatedByUserId,
    };
  }

  async updateDeviceSettings(dto: { maxActiveDevices?: number }, user: { id: string }) {
    const maxActiveDevices = Number(dto.maxActiveDevices);
    if (!Number.isInteger(maxActiveDevices) || maxActiveDevices < 1 || maxActiveDevices > 999) {
      throw new BadRequestException('Лимит ТСД должен быть целым числом от 1 до 999.');
    }
    const activeDevices = await this.prisma.tsdDevice.count({ where: { status: TsdDeviceStatus.ACTIVE } });
    if (maxActiveDevices < activeDevices) {
      throw new BadRequestException(`Лимит не может быть меньше числа активных ТСД: сейчас активно ${activeDevices}.`);
    }

    const setting = await this.prisma.systemSetting.upsert({
      where: { key: TSD_DEVICE_LIMIT_KEY },
      update: {
        value: { maxActiveDevices },
        updatedByUserId: user.id,
      },
      create: {
        key: TSD_DEVICE_LIMIT_KEY,
        value: { maxActiveDevices },
        updatedByUserId: user.id,
      },
    });

    return {
      maxActiveDevices,
      activeDevices,
      totalDevices: await this.prisma.tsdDevice.count(),
      defaultLimit: DEFAULT_TSD_DEVICE_LIMIT,
      updatedAt: setting.updatedAt,
      updatedByUserId: setting.updatedByUserId,
    };
  }

  async login(dto: LoginTsdDeviceDto) {
    const device = await this.prisma.tsdDevice.findUnique({
      where: { code: this.normalizeCode(dto.code) },
      include: {
        user: {
          include: {
            clientScopes: true,
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
          },
        },
      },
    });

    if (!device || !(await this.passwords.verify(dto.secret, device.secretHash))) {
      throw new UnauthorizedException('Неверный код или секрет ТСД.');
    }

    if (device.status !== TsdDeviceStatus.ACTIVE) {
      throw new UnauthorizedException('ТСД заблокирован.');
    }

    if (device.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Пользователь ТСД заблокирован.');
    }

    const permissionCodes = [
      ...new Set(
        device.user.roles.flatMap((item) => item.role.permissions.map((permission) => permission.permission.code)),
      ),
    ];
    if (!permissionCodes.includes('stock:write') && !permissionCodes.includes('system:admin')) {
      throw new UnauthorizedException('У пользователя ТСД нет права stock:write.');
    }

    await this.prisma.tsdDevice.update({
      where: { id: device.id },
      data: { lastLoginAt: new Date(), lastSeenAt: new Date() },
    });

    return {
      accessToken: this.tokens.sign(device.userId, { deviceId: device.id, deviceCode: device.code }),
      tokenType: 'Bearer',
      device: {
        id: device.id,
        code: device.code,
        name: device.name,
      },
      user: {
        id: device.user.id,
        email: device.user.email,
        name: device.user.name,
        permissionCodes,
      },
    };
  }

  async touchActiveDevice(deviceId?: string) {
    if (!deviceId) {
      return undefined;
    }

    const device = await this.prisma.tsdDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, status: true },
    });

    if (!device || device.status !== TsdDeviceStatus.ACTIVE) {
      throw new UnauthorizedException('ТСД заблокирован или удален.');
    }

    return this.prisma.tsdDevice.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });
  }

  private generateSecret() {
    return randomBytes(24).toString('base64url');
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private async assertCanCreateActiveDevice() {
    const [{ maxActiveDevices }, activeDevices] = await Promise.all([
      this.resolveDeviceLimit(),
      this.prisma.tsdDevice.count({ where: { status: TsdDeviceStatus.ACTIVE } }),
    ]);

    if (activeDevices >= maxActiveDevices) {
      throw new BadRequestException(
        `Достигнут лимит активных ТСД: ${activeDevices} из ${maxActiveDevices}. Владелец или админ может увеличить лимит в настройках ТСД.`,
      );
    }
  }

  private async resolveDeviceLimit() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: TSD_DEVICE_LIMIT_KEY },
    });
    const value = setting?.value;
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const maxActiveDevices = Number(payload.maxActiveDevices);

    return {
      maxActiveDevices: Number.isInteger(maxActiveDevices) && maxActiveDevices > 0 ? maxActiveDevices : DEFAULT_TSD_DEVICE_LIMIT,
      updatedAt: setting?.updatedAt ?? null,
      updatedByUserId: setting?.updatedByUserId ?? null,
    };
  }
}
