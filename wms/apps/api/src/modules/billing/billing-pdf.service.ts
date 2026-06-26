import { Injectable } from '@nestjs/common';
import pdfMake = require('pdfmake');
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { configurePdfMake } from '../../common/pdf/pdfmake';
import type { AuthUser } from '../auth/auth.types';
import { BillingDocumentService, BillingPrintableDocument } from './billing-document.service';

export type BillingPdfFile = {
  fileName: string;
  contentType: 'application/pdf';
  buffer: Buffer;
};

@Injectable()
export class BillingPdfService {
  constructor(private readonly documents: BillingDocumentService) {
    configurePdfMake();
  }

  async getInvoicePdf(invoiceId: string, user: AuthUser) {
    const document = await this.documents.getInvoiceDocument(invoiceId, user);
    return this.renderPdf(document, 'invoice');
  }

  async getInvoiceActPdf(invoiceId: string, user: AuthUser) {
    const document = await this.documents.getInvoiceActDocument(invoiceId, user);
    return this.renderPdf(document, 'act');
  }

  private async renderPdf(document: BillingPrintableDocument, kind: 'invoice' | 'act'): Promise<BillingPdfFile> {
    const pdfDocument = pdfMake.createPdf(kind === 'act' ? actDefinition(document) : invoiceDefinition(document));
    const buffer = await pdfDocument.getBuffer();

    return {
      fileName: document.fileName.replace(/\.html$/i, '.pdf'),
      contentType: 'application/pdf',
      buffer,
    };
  }
}

function invoiceDefinition(document: BillingPrintableDocument): TDocumentDefinitions {
  return baseDefinition(document, [
    documentHeader(document),
    metaGrid([
      ['Клиент', clientLines(document)],
      ['Документ', [`Выставлен: ${formatDate(document.issuedAt)}`, `Оплатить до: ${formatDate(document.dueDate)}`, `Ответственный: ${document.createdBy?.name ?? '-'}`]],
    ]),
    sectionTitle('Позиции'),
    positionsTable(document),
    totalsBlock(document, true),
    paymentsBlock(document),
  ]);
}

function actDefinition(document: BillingPrintableDocument): TDocumentDefinitions {
  return baseDefinition(document, [
    documentHeader(document, `Основание: счет № ${document.number}`),
    metaGrid([
      ['Заказчик', clientLines(document)],
      ['Исполнитель', ['LOGOFF Fulfillment WMS', `Дата акта: ${formatDate(document.issuedAt ?? new Date().toISOString())}`, `Ответственный: ${document.createdBy?.name ?? '-'}`]],
    ]),
    sectionTitle('Оказанные услуги'),
    positionsTable(document),
    totalsBlock(document, false),
    {
      text: 'Услуги оказаны в полном объеме за указанный период. Стороны подтверждают состав и стоимость услуг по настоящему акту.',
      margin: [0, 12, 0, 22],
    },
    signaturesBlock(),
  ]);
}

function baseDefinition(document: BillingPrintableDocument, content: Content[]): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [36, 42, 36, 48],
    info: {
      title: document.title,
      subject: document.documentKind === 'act' ? 'Акт оказанных услуг' : 'Счет',
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
    content,
  };
}

function documentHeader(document: BillingPrintableDocument, suffix?: string): Content {
  const subtitle = [
    suffix,
    `Статус: ${document.statusLabel}`,
    `Период: ${formatDate(document.periodFrom)} - ${formatDate(document.periodTo)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return [
    { text: document.title, style: 'title' },
    { text: subtitle, style: 'muted' },
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

function clientLines(document: BillingPrintableDocument) {
  return [
    `${document.client.legalName || document.client.name} (${document.client.code})`,
    taxLine(document),
    document.client.legalAddress ? `Юр. адрес: ${document.client.legalAddress}` : '',
    document.client.actualAddress ? `Факт. адрес: ${document.client.actualAddress}` : '',
    document.client.phone || document.client.email ? contactLine(document) : '',
    document.client.bankName ? `Банк: ${document.client.bankName}` : '',
    bankAccountLine(document),
  ].filter(Boolean);
}

function taxLine(document: BillingPrintableDocument) {
  return [
    `ИНН: ${document.client.inn ?? '-'}`,
    `КПП: ${document.client.kpp ?? '-'}`,
    document.client.ogrn ? `ОГРН: ${document.client.ogrn}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function contactLine(document: BillingPrintableDocument) {
  return [`Телефон: ${document.client.phone ?? '-'}`, `Почта: ${document.client.email ?? '-'}`].join(' · ');
}

function bankAccountLine(document: BillingPrintableDocument) {
  return [
    document.client.bankBik ? `БИК: ${document.client.bankBik}` : '',
    document.client.bankAccount ? `Р/с: ${document.client.bankAccount}` : '',
    document.client.correspondentAccount ? `К/с: ${document.client.correspondentAccount}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function sectionTitle(text: string): Content {
  return { text, style: 'section' };
}

function positionsTable(document: BillingPrintableDocument): Content {
  const header = ['№', 'Услуга', 'Дата', 'Кол-во', 'Цена', 'Сумма'].map(headerCell);
  const rows = document.rows.map((row) => [
    cell(String(row.position), 'center'),
    cell(row.description),
    cell(formatDate(row.serviceDate), 'center'),
    cell(formatNumber(row.quantity), 'right'),
    cell(`${formatMoney(row.unitPriceRub)} руб.`, 'right'),
    cell(`${formatMoney(row.totalRub)} руб.`, 'right'),
  ]);

  return {
    table: {
      headerRows: 1,
      widths: [20, '*', 46, 42, 54, 60],
      body: [header, ...rows],
      dontBreakRows: true,
    },
    layout: 'lightHorizontalLines',
    fontSize: 8,
  };
}

function totalsBlock(document: BillingPrintableDocument, includePaymentBalance: boolean): Content {
  const lines: Content[] = [
    { text: `Итого: ${formatMoney(document.totalRub)} руб.`, style: 'total', alignment: 'right' },
  ];

  if (includePaymentBalance) {
    lines.push(
      { text: `Оплачено: ${formatMoney(document.paidRub)} руб.`, alignment: 'right' },
      { text: `К оплате: ${formatMoney(document.remainingRub)} руб.`, alignment: 'right' },
    );
  } else {
    lines.push({ text: `Итого оказано услуг на сумму: ${formatMoney(document.totalRub)} руб.`, alignment: 'right' });
  }

  return { stack: lines, margin: [0, 10, 0, 0] };
}

function paymentsBlock(document: BillingPrintableDocument): Content {
  if (document.payments.length === 0) {
    return [];
  }

  return [
    sectionTitle('Оплаты'),
    {
      table: {
        headerRows: 1,
        widths: [62, '*', '*', 70],
        body: [
          ['Дата', 'Способ', 'Номер', 'Сумма'].map(headerCell),
          ...document.payments.map((payment) => [
            cell(formatDate(payment.paidAt), 'center'),
            cell(payment.method ?? '-'),
            cell(payment.reference ?? '-'),
            cell(`${formatMoney(payment.amountRub)} руб.`, 'right'),
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
    },
  ];
}

function signaturesBlock(): Content {
  return {
    columns: [
      signatureColumn('Исполнитель'),
      signatureColumn('Заказчик'),
    ],
    columnGap: 28,
  };
}

function signatureColumn(title: string): Content {
  return {
    stack: [
      { text: title, bold: true },
      {
        canvas: [{ type: 'line', x1: 0, y1: 34, x2: 220, y2: 34, lineWidth: 0.7, lineColor: '#111827' }],
        margin: [0, 0, 0, 4],
      },
      { text: 'Подпись / расшифровка', color: '#64748b', fontSize: 8 },
    ],
  };
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

function formatMoney(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}
