import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientRequestStatus, ClientRequestType, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';

type MarketplaceTemplateFile = {
  fileName: string;
  mimeType: string;
  content: Buffer;
};

type RequestForMarketplaceTemplate = Prisma.ClientRequestGetPayload<{
  include: typeof requestMarketplaceTemplateInclude;
}>;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class ClientRequestMarketplaceTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  async getProductsTemplate(requestId: string, user: AuthUser): Promise<MarketplaceTemplateFile> {
    const request = await this.loadRequest(requestId, user);
    assertMarketplaceTemplatesReady(request);
    const rows = aggregateProductRows(packageRows(request));

    const workbook = XLSX.utils.book_new();
    appendSheet(
      workbook,
      'WB',
      [
        ['Баркод', 'Количество'],
        ...rows.map((row) => [row.barcode, row.quantity]),
      ],
      [22, 14],
    );
    appendSheet(
      workbook,
      'Ozon',
      [
        ['Артикул', 'Название товара', 'Штрихкод', 'Количество', 'Размер', 'Комментарий WMS'],
        ...rows.map((row) => [row.article, row.name, row.barcode, row.quantity, '', 'Заготовка из WMS']),
      ],
      [24, 42, 22, 14, 16, 28],
    );
    appendInstructionsSheet(workbook, request, [
      'Лист WB повторяет присланный шаблон Wildberries для загрузки товаров: Баркод + Количество.',
      'Лист Ozon является рабочей заготовкой из WMS. Точный файл Ozon может отличаться в зависимости от схемы поставки и кабинета.',
      'Если маркетплейс требует строго свой XLSX, загрузите данные из этих листов в кабинетный шаблон.',
    ]);

    return {
      fileName: `${safeFileName(`marketplace-products-${request.title}-${request.id.slice(0, 8)}`)}.xlsx`,
      mimeType: XLSX_MIME,
      content: writeWorkbook(workbook),
    };
  }

  async getPackagesTemplate(requestId: string, user: AuthUser): Promise<MarketplaceTemplateFile> {
    const request = await this.loadRequest(requestId, user);
    assertMarketplaceTemplatesReady(request);
    const rows = packageRows(request);

    const workbook = XLSX.utils.book_new();
    appendSheet(
      workbook,
      'WB',
      [
        ['Баркод товара', 'Кол-во товаров', 'ШК короба', 'Срок годности'],
        ...rows.map((row) => [row.barcode, row.quantity, row.packageCode, '']),
      ],
      [24, 18, 26, 18],
    );
    appendSheet(
      workbook,
      'Ozon',
      [
        ['Номер грузоместа/короба', 'Артикул', 'Штрихкод товара', 'Количество', 'Название товара', 'Комментарий WMS'],
        ...rows.map((row) => [row.packageCode, row.article, row.barcode, row.quantity, row.name, row.comment]),
      ],
      [28, 24, 24, 14, 42, 34],
    );
    appendInstructionsSheet(workbook, request, [
      'Лист WB повторяет присланный шаблон Wildberries для загрузки упаковки: Баркод товара + Кол-во товаров + ШК короба + Срок годности.',
      request.packages.length
        ? 'Упаковка заполнена по упаковочным местам заявки.'
        : 'В заявке еще нет упаковочных мест, поэтому ШК короба оставлены пустыми. Заполните их после упаковки.',
      'Лист Ozon является рабочей заготовкой из WMS. Точный файл Ozon может отличаться в зависимости от схемы поставки и кабинета.',
    ]);

    return {
      fileName: `${safeFileName(`marketplace-packages-${request.title}-${request.id.slice(0, 8)}`)}.xlsx`,
      mimeType: XLSX_MIME,
      content: writeWorkbook(workbook),
    };
  }

  private async loadRequest(requestId: string, user: AuthUser) {
    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      include: requestMarketplaceTemplateInclude,
    });

    if (!request) {
      throw new NotFoundException('Клиентская заявка не найдена.');
    }

    this.clientScopes.requireClientAccess(user, request.clientId, 'read');
    return request;
  }
}

const requestMarketplaceTemplateInclude = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
      legalName: true,
    },
  },
  items: {
    include: {
      sku: {
        select: {
          id: true,
          internalSku: true,
          clientSku: true,
          article: true,
          name: true,
          size: true,
          barcodes: {
            select: {
              value: true,
              isPrimary: true,
            },
          },
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  },
  packages: {
    include: {
      items: {
        include: {
          requestItem: {
            include: {
              sku: {
                select: {
                  id: true,
                  internalSku: true,
                  clientSku: true,
                  article: true,
                  name: true,
                  size: true,
                  barcodes: {
                    select: {
                      value: true,
                      isPrimary: true,
                    },
                  },
                },
              },
            },
          },
          sku: {
            select: {
              id: true,
              internalSku: true,
              clientSku: true,
              article: true,
              name: true,
              size: true,
              barcodes: {
                select: {
                  value: true,
                  isPrimary: true,
                },
              },
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.ClientRequestInclude;

function packageRows(request: RequestForMarketplaceTemplate) {
  if (request.packages.length > 0) {
    return request.packages.flatMap((packagePlace) =>
      packagePlace.items.map((item) => {
        const sku = item.sku ?? item.requestItem.sku;
        return {
          packageCode: packagePlace.packageCode,
          barcode: finalBarcodeForRequestItem(item.requestItem, item.barcode ?? skuPrimaryBarcode(sku)),
          quantity: item.quantity,
          article: skuArticle(sku),
          name: item.requestItem.name ?? sku?.name ?? '',
          comment: 'Упаковка из WMS',
        };
      }),
    );
  }

  return request.items.map((item) => ({
    packageCode: '',
    barcode: finalBarcodeForRequestItem(item, requestItemBarcode(item)),
    quantity: item.quantity,
    article: requestItemArticle(item),
    name: item.name ?? item.sku?.name ?? '',
    comment: 'ШК короба нужно заполнить после упаковки',
  }));
}

function aggregateProductRows(rows: ReturnType<typeof packageRows>) {
  const result = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = result.get(row.barcode);
    if (existing) {
      existing.quantity += row.quantity;
      continue;
    }

    result.set(row.barcode, { ...row });
  }
  return [...result.values()];
}

function assertMarketplaceTemplatesReady(request: RequestForMarketplaceTemplate) {
  if (request.type !== ClientRequestType.OUTBOUND) {
    throw new BadRequestException('Шаблоны маркетплейсов доступны только для заявок на отгрузку.');
  }

  if (request.status !== ClientRequestStatus.PACKED && request.status !== ClientRequestStatus.DONE) {
    throw new BadRequestException(
      'Файл WB/Ozon можно сформировать только после выполнения перемещений, перемаркировки и упаковки заявки.',
    );
  }

  if (request.packages.length === 0) {
    throw new BadRequestException('В заявке нет упаковочных мест. Сначала выполните упаковку заявки.');
  }
}

function requestItemBarcode(item: RequestForMarketplaceTemplate['items'][number]) {
  return item.barcode ?? skuPrimaryBarcode(item.sku) ?? '';
}

function finalBarcodeForRequestItem(
  item: Pick<RequestForMarketplaceTemplate['items'][number], 'barcode' | 'comment'>,
  fallback?: string | null,
) {
  return parseRelabelTargetBarcode(item.comment) ?? item.barcode ?? fallback ?? '';
}

function parseRelabelTargetBarcode(comment?: string | null) {
  if (!comment) {
    return null;
  }

  for (const part of comment.split(';')) {
    const [rawKey, ...rawValue] = part.split(':');
    const key = rawKey.trim().toLowerCase();
    if (key !== 'перемаркировка в') {
      continue;
    }

    const value = rawValue.join(':').trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function requestItemArticle(item: RequestForMarketplaceTemplate['items'][number]) {
  return skuArticle(item.sku);
}

function skuArticle(
  sku:
    | {
        internalSku: string;
        clientSku: string | null;
        article: string | null;
      }
    | null,
) {
  return sku?.article ?? sku?.clientSku ?? sku?.internalSku ?? '';
}

function skuPrimaryBarcode(sku: { barcodes?: Array<{ value: string; isPrimary: boolean }> } | null) {
  return sku?.barcodes?.find((barcode) => barcode.isPrimary)?.value ?? sku?.barcodes?.[0]?.value ?? null;
}

function appendSheet(workbook: XLSX.WorkBook, name: string, rows: unknown[][], widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map((width) => ({ wch: width }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function appendInstructionsSheet(workbook: XLSX.WorkBook, request: RequestForMarketplaceTemplate, notes: string[]) {
  appendSheet(
    workbook,
    'Инструкция',
    [
      ['Параметр', 'Значение'],
      ['Заявка', request.title],
      ['Клиент', request.client.name],
      ['Код клиента', request.client.code],
      ['Юр. название', request.client.legalName ?? ''],
      ['Город поставки', request.destinationCity ?? ''],
      ['Дата формирования', new Date()],
      [],
      ['Важно', ''],
      ...notes.map((note, index) => [`${index + 1}.`, note]),
    ],
    [24, 92],
  );
}

function writeWorkbook(workbook: XLSX.WorkBook) {
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, '_');
}
