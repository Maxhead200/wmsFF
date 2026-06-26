import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.client.findMany({
      where: {
        id: this.clientScopes.resolveClientFilter(user),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        inn: true,
        kpp: true,
        ogrn: true,
        legalAddress: true,
        actualAddress: true,
        phone: true,
        email: true,
        bankName: true,
        bankBik: true,
        bankAccount: true,
        correspondentAccount: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async get(id: string, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, id, 'read');

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

  create(dto: CreateClientDto, user: AuthUser) {
    this.clientScopes.requireGlobalClientAccess(user);

    // Русский комментарий: код клиента нужен для Excel-импортов и быстрых фильтров операторов.
    return this.prisma.client.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        ...optionalCreateClientData(dto),
      },
    });
  }

  update(id: string, dto: UpdateClientDto, user: AuthUser) {
    this.clientScopes.requireGlobalClientAccess(user);

    // Русский комментарий: реквизиты клиента обновляем отдельно, чтобы счета и акты брали актуальные данные из карточки.
    return this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.code === undefined ? {} : { code: dto.code.trim() }),
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...nullableUpdateClientData(dto),
      },
    });
  }
}

type ClientRequisitesDto = CreateClientDto | UpdateClientDto;

const optionalClientFields = [
  'legalName',
  'inn',
  'kpp',
  'ogrn',
  'legalAddress',
  'actualAddress',
  'phone',
  'email',
  'bankName',
  'bankBik',
  'bankAccount',
  'correspondentAccount',
] as const;

function optionalCreateClientData(dto: ClientRequisitesDto) {
  return Object.fromEntries(
    optionalClientFields
      .map((field) => [field, dto[field]?.trim()])
      .filter((entry): entry is [typeof optionalClientFields[number], string] => Boolean(entry[1])),
  );
}

function nullableUpdateClientData(dto: UpdateClientDto) {
  return Object.fromEntries(
    optionalClientFields
      .filter((field) => dto[field] !== undefined)
      .map((field) => {
        const value = dto[field]?.trim();
        return [field, value || null];
      }),
  );
}
