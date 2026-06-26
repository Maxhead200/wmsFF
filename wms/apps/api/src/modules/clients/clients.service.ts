import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        inn: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async get(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            skus: true,
            boxes: true,
            pallets: true,
            movements: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Клиент не найден.');
    }

    return client;
  }

  create(dto: CreateClientDto) {
    // Русский комментарий: код клиента нужен для Excel-импортов и быстрых фильтров операторов.
    return this.prisma.client.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        inn: dto.inn?.trim(),
        kpp: dto.kpp?.trim(),
        phone: dto.phone?.trim(),
        email: dto.email?.trim(),
      },
    });
  }
}
