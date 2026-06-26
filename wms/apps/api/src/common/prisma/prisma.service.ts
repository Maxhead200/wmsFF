import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Русский комментарий: подключение делаем на старте API, чтобы ошибки БД были видны сразу.
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
