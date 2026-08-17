import { PrismaClient, UserStatus } from '@prisma/client';
import { PasswordService } from '../modules/auth/password.service';

const prisma = new PrismaClient();
const passwords = new PasswordService();

async function main() {
  const adminLogin = process.env.DEFAULT_ADMIN_LOGIN ?? 'admin';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin';
  const adminName = process.env.DEFAULT_ADMIN_NAME ?? 'Администратор';

  await seedAdminAccessModel();

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'ADMIN' },
  });
  const passwordHash = await passwords.hash(adminPassword);

  // Русский комментарий: скрипт запускается вручную/при обслуживании, чтобы не сбрасывать пароль при каждом старте API.
  const savedUser = await prisma.user.upsert({
    where: { email: adminLogin.trim().toLowerCase() },
    update: {
      name: adminName,
      passwordHash,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: adminLogin.trim().toLowerCase(),
      name: adminName,
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: savedUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: savedUser.id,
      roleId: adminRole.id,
    },
  });

  console.log(`Default admin is ready: ${savedUser.email}`);
}

async function seedAdminAccessModel() {
  const permission = await prisma.permission.upsert({
    where: { code: 'system:admin' },
    update: { name: 'Полный административный доступ' },
    create: { code: 'system:admin', name: 'Полный административный доступ' },
  });

  const role = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: { name: 'Администратор' },
    create: { code: 'ADMIN', name: 'Администратор' },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: permission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: permission.id,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
