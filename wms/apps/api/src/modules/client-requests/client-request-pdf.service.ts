import { Injectable } from '@nestjs/common';
import pdfMake = require('pdfmake');
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { configurePdfMake } from '../../common/pdf/pdfmake';
import type { AuthUser } from '../auth/auth.types';
import { ClientRequestDocumentService, type ClientRequestPrintableDocument } from './client-request-document.service';

export type ClientRequestPdfFile = {
  fileName: string;
  contentType: 'application/pdf';
  buffer: Buffer;
};

@Injectable()
export class ClientRequestPdfService {
  constructor(private readonly documents: ClientRequestDocumentService) {
    configurePdfMake();
  }

  async getRequestPdf(requestId: string, user: AuthUser): Promise<ClientRequestPdfFile> {
    const document = await this.documents.getRequestDocument(requestId, user);
    const pdfDocument = pdfMake.createPdf(requestDefinition(document));
    const buffer = await pdfDocument.getBuffer();

    return {
      fileName: document.fileName.replace(/\.html$/i, '.pdf'),
      contentType: 'application/pdf',
      buffer,
    };
  }
}

function requestDefinition(document: ClientRequestPrintableDocument): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [36, 42, 36, 48],
    info: {
      title: document.title,
      subject: 'Клиентская заявка',
      author: 'LOGOFF WMS',
      creator: 'LOGOFF WMS',
    },
    defaultStyle: {
      font: 'DejaVuSans',
      fontSize: 9,
      color: '#111827',
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: 'LOGOFF WMS', color: '#64748b', fontSize: 8 },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', color: '#64748b', fontSize: 8 },
      ],
      margin: [36, 0, 36, 0],
    }),
    styles: {
      title: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      muted: { color: '#64748b' },
      section: { fontSize: 12, bold: true, margin: [0, 16, 0, 8] },
      boxTitle: { bold: true, margin: [0, 0, 0, 5] },
      tableHeader: { bold: true, color: '#334155', fillColor: '#f1f5f9' },
      total: { bold: true, fontSize: 11 },
    },
    content: [
      documentHeader(document),
      metaGrid([
        ['Клиент', clientLines(document)],
        ['Заявка', requestLines(document)],
      ]),
      metaGrid([
        ['Контакт', contactLines(document)],
        ['Комментарии', commentLines(document)],
      ]),
      sectionTitle('Состав заявки'),
      requestRowsTable(document),
      totalsBlock(document),
      ...packagesBlock(document),
    ],
  };
}

function documentHeader(document: ClientRequestPrintableDocument): Content {
  return [
    { text: document.title, style: 'title' },
    {
      text: `${document.typeLabel} · ${document.priorityLabel} · ${document.statusLabel}`,
      style: 'muted',
    },
  ];
}

function metaGrid(boxes: Array<[string, string[]]>): Content {
  return {
    table: {
      widths: ['*', '*'],
      body: [
        boxes.map(([title, lines]) => ({
          stack: [{ text: title, style: 'boxTitle' }, ...lines.map((line) => ({ text: line }))],
          margin: [8, 7, 8, 7],
        })),
      ],
    },
    layout: {
      hLineColor: () => '#d7dde5',
      vLineColor: () => '#d7dde5',
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 16, 0, 0],
  };
}

function clientLines(document: ClientRequestPrintableDocument) {
  return [
    `${document.client.name} (${document.client.code})`,
    `ИНН: ${document.client.inn ?? '-'} · КПП: ${document.client.kpp ?? '-'}`,
    document.client.legalAddress ?? document.client.actualAddress ?? '-',
  ];
}

function requestLines(document: ClientRequestPrintableDocument) {
  return [
    `Создана: ${formatDate(document.createdAt)}`,
    `Желаемая дата: ${formatDate(document.desiredDate)}`,
    `Ответственный: ${document.assignedTo?.name ?? document.createdBy?.name ?? '-'}`,
  ];
}

function contactLines(document: ClientRequestPrintableDocument) {
  return [document.contactName ?? '-', document.contactPhone ?? '-', document.deliveryAddress ?? '-'];
}

function commentLines(document: ClientRequestPrintableDocument) {
  return [`Клиент: ${document.comment ?? '-'}`, `Менеджер: ${document.managerComment ?? '-'}`];
}

function sectionTitle(text: string): Content {
  return { text, style: 'section' };
}

function requestRowsTable(document: ClientRequestPrintableDocument): Content {
  const header = ['№', 'SKU', 'Штрихкод', 'Наименование', 'Кол-во', 'Комментарий'].map(headerCell);
  const rows = document.rows.map((row) => [
    cell(String(row.position), 'center'),
    cell(row.internalSku ?? row.clientSku ?? row.article ?? '-'),
    cell(row.barcode ?? '-'),
    cell(row.name ?? '-'),
    cell(formatNumber(row.quantity), 'right'),
    cell(row.comment ?? '-'),
  ]);

  return {
    table: {
      headerRows: 1,
      widths: [20, 64, 70, '*', 44, 80],
      body: [header, ...(rows.length ? rows : [[cell('-', 'center'), cell('-'), cell('-'), cell('Позиции не указаны.'), cell('-'), cell('-')]])],
      dontBreakRows: true,
    },
    layout: 'lightHorizontalLines',
    fontSize: 8,
  };
}

function totalsBlock(document: ClientRequestPrintableDocument): Content {
  return {
    text: `Позиций: ${formatNumber(document.rowsCount)} · Количество: ${formatNumber(document.totalQuantity)}`,
    style: 'total',
    alignment: 'right',
    margin: [0, 10, 0, 0],
  };
}

function packagesBlock(document: ClientRequestPrintableDocument): Content[] {
  if (document.packages.length === 0) {
    return [];
  }

  return [
    sectionTitle('Упаковочные места'),
    {
      table: {
        headerRows: 1,
        widths: [82, 92, '*', 86],
        body: [
          ['Место', 'Параметры', 'Состав', 'Комментарий'].map(headerCell),
          ...document.packages.map((packagePlace) => [
            cell(packagePlace.packageCode),
            cell(packageDimensions(packagePlace)),
            cell(packageItemsSummary(packagePlace)),
            cell(packagePlace.comment ?? '-'),
          ]),
        ],
        dontBreakRows: true,
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
    },
  ];
}

function packageDimensions(packagePlace: ClientRequestPrintableDocument['packages'][number]) {
  const dimensions =
    packagePlace.lengthCm && packagePlace.widthCm && packagePlace.heightCm
      ? `${formatNumber(packagePlace.lengthCm)}x${formatNumber(packagePlace.widthCm)}x${formatNumber(packagePlace.heightCm)} см`
      : null;
  const weight = packagePlace.weightGrams ? `${formatNumber(packagePlace.weightGrams)} г` : null;
  return [packagePlace.packageType, dimensions, weight].filter(Boolean).join(' · ') || '-';
}

function packageItemsSummary(packagePlace: ClientRequestPrintableDocument['packages'][number]) {
  return (
    packagePlace.items
      .map((item) => `${item.internalSku ?? item.name ?? item.barcode ?? item.requestItemId} x ${formatNumber(item.quantity)}`)
      .join(', ') || '-'
  );
}

function headerCell(text: string): TableCell {
  return { text, style: 'tableHeader' };
}

function cell(text: string, alignment?: 'left' | 'center' | 'right'): TableCell {
  return { text, alignment };
}

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}
