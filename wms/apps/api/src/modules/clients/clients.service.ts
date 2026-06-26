import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      select: this.clientSummarySelect(),
    });
  }

  async get(id: string, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, id, 'read');

    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        fulfillmentManager: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
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

  async create(dto: CreateClientDto, user: AuthUser) {
    this.clientScopes.requireGlobalClientAccess(user);
    await this.ensureFulfillmentManagerExists(dto.fulfillmentManagerUserId);

    return this.createWithGeneratedCode(dto);
  }

  async update(id: string, dto: UpdateClientDto, user: AuthUser) {
    this.clientScopes.requireGlobalClientAccess(user);
    await this.ensureFulfillmentManagerExists(dto.fulfillmentManagerUserId);

    return this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.clientKind === undefined ? {} : { clientKind: dto.clientKind }),
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.fulfillmentManagerUserId === undefined
          ? {}
          : { fulfillmentManagerUserId: normalizeNullableString(dto.fulfillmentManagerUserId) }),
        ...nullableUpdateClientData(dto),
      },
      select: this.clientSummarySelect(),
    });
  }

  private async createWithGeneratedCode(dto: CreateClientDto) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = await this.nextClientCode();
      try {
        return await this.prisma.client.create({
          data: {
            code,
            clientKind: dto.clientKind,
            name: dto.name.trim(),
            legalName: dto.legalName.trim(),
            inn: dto.inn.trim(),
            ...optionalCreateClientData(dto),
            fulfillmentManagerUserId: normalizeNullableString(dto.fulfillmentManagerUserId),
          },
          select: this.clientSummarySelect(),
        });
      } catch (caught) {
        if (!isUniqueClientCodeError(caught)) {
          throw caught;
        }
      }
    }

    throw new BadRequestException('Не удалось сгенерировать уникальный код клиента.');
  }

  private async nextClientCode() {
    const latest = await this.prisma.client.findFirst({
      where: {
        code: {
          startsWith: 'CL-',
        },
      },
      orderBy: {
        code: 'desc',
      },
      select: {
        code: true,
      },
    });
    const latestNumber = latest?.code.match(/^CL-(\d+)$/)?.[1];
    const nextNumber = latestNumber ? Number(latestNumber) + 1 : 1;
    return `CL-${String(nextNumber).padStart(6, '0')}`;
  }

  private async ensureFulfillmentManagerExists(userId?: string) {
    const normalized = normalizeNullableString(userId);
    if (!normalized) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: normalized },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Менеджер фулфилмента не найден.');
    }
  }

  private clientSummarySelect() {
    return {
      id: true,
      code: true,
      name: true,
      clientKind: true,
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
      fulfillmentManagerUserId: true,
      fulfillmentManager: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      status: true,
      createdAt: true,
    } as const;
  }
}

type ClientRequisitesDto = CreateClientDto | UpdateClientDto;

const optionalClientFields = [
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
  const fields = ['legalName', 'inn', ...optionalClientFields] as const;
  return Object.fromEntries(
    fields
      .filter((field) => dto[field] !== undefined)
      .map((field) => {
        const value = dto[field]?.trim();
        return [field, value || null];
      }),
  );
}

function normalizeNullableString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function isUniqueClientCodeError(caught: unknown) {
  return caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === 'P2002';
}
