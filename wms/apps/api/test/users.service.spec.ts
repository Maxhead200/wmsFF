import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../src/modules/users/users.service';

describe('UsersService', () => {
  it('заменяет роли пользователя выбранным набором', async () => {
    const tx = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'user-1' }),
      },
      userRole: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      userRole: {
        count: vi.fn().mockResolvedValue(0),
      },
      role: {
        count: vi.fn(),
      },
      user: {
        count: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue(userSummary(['MANAGER', 'OPERATOR'])),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const accessModel = {
      resolveRoles: vi.fn().mockResolvedValue([
        { id: 'role-manager', code: 'MANAGER' },
        { id: 'role-operator', code: 'OPERATOR' },
      ]),
    };
    const service = new UsersService(prisma as never, accessModel as never, {} as never);

    const saved = await service.updateRoles('user-1', { roleCodes: ['manager', 'OPERATOR', 'manager'] });

    expect(accessModel.resolveRoles).toHaveBeenCalledWith(['MANAGER', 'OPERATOR']);
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', roleId: 'role-manager' },
        { userId: 'user-1', roleId: 'role-operator' },
      ],
      skipDuplicates: true,
    });
    expect(saved.roles.map((item) => item.role.code)).toEqual(['MANAGER', 'OPERATOR']);
  });

  it('не снимает последнюю роль с полным административным доступом', async () => {
    const prisma = {
      userRole: {
        count: vi.fn().mockResolvedValue(1),
      },
      role: {
        count: vi.fn().mockResolvedValue(0),
      },
      user: {
        count: vi.fn().mockResolvedValue(0),
        findUniqueOrThrow: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    const accessModel = {
      resolveRoles: vi.fn().mockResolvedValue([{ id: 'role-operator', code: 'OPERATOR' }]),
    };
    const service = new UsersService(prisma as never, accessModel as never, {} as never);

    await expect(service.updateRoles('admin-1', { roleCodes: ['OPERATOR'] })).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function userSummary(roleCodes: string[]) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    status: 'ACTIVE',
    createdAt: new Date('2026-06-26T00:00:00.000Z'),
    roles: roleCodes.map((code) => ({
      role: {
        code,
        name: code,
      },
    })),
    clientScopes: [],
  };
}
