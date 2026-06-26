import { Injectable, NotFoundException } from '@nestjs/common';
import { BillingInvoiceStatus, BillingPaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';

@Injectable()
export class BillingDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  async getInvoiceDocument(invoiceId: string, user: AuthUser): Promise<BillingPrintableDocument> {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: invoiceDocumentInclude,
    });

    if (!invoice) {
      throw new NotFoundException('Счет биллинга не найден.');
    }

    this.clientScopes.requireClientAccess(user, invoice.clientId, 'read');

    const rows = invoice.items.map((item, index) => ({
      position: index + 1,
      description: item.description,
      unit: item.unit,
      quantity: Number(item.quantity),
      unitPriceRub: Number(item.unitPriceRub),
      totalRub: Number(item.totalRub),
      serviceDate: item.serviceDate.toISOString(),
    }));
    const payments = invoice.payments
      .filter((payment) => payment.status === BillingPaymentStatus.RECORDED)
      .map((payment) => ({
        id: payment.id,
        amountRub: Number(payment.amountRub),
        paidAt: payment.paidAt.toISOString(),
        method: payment.method,
        reference: payment.reference,
        comment: payment.comment,
      }));
    const totalRub = Number(invoice.totalRub);
    const paidRub = Number(invoice.paidRub);
    const remainingRub = roundMoney(totalRub - paidRub);
    const payload: InvoiceDocumentPayload = {
      invoiceId: invoice.id,
      number: invoice.number,
      title: `Счет ${invoice.number}`,
      fileName: `${safeFileName(invoice.number)}.html`,
      status: invoice.status,
      statusLabel: invoiceStatusLabel(invoice.status),
      periodFrom: invoice.periodFrom.toISOString(),
      periodTo: invoice.periodTo.toISOString(),
      dueDate: invoice.dueDate?.toISOString() ?? null,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      totalRub,
      paidRub,
      remainingRub,
      comment: invoice.comment,
      client: {
        id: invoice.client.id,
        code: invoice.client.code,
        name: invoice.client.name,
        inn: invoice.client.inn,
        kpp: invoice.client.kpp,
        legalAddress: invoice.client.legalAddress,
        actualAddress: invoice.client.actualAddress,
        email: invoice.client.email,
        phone: invoice.client.phone,
      },
      rows,
      payments,
      createdBy: invoice.createdBy
        ? {
            id: invoice.createdBy.id,
            email: invoice.createdBy.email,
            name: invoice.createdBy.name,
          }
        : null,
    };

    return {
      ...payload,
      html: renderInvoiceHtml(payload),
    };
  }

  async getInvoiceActDocument(invoiceId: string, user: AuthUser): Promise<BillingPrintableDocument> {
    const invoiceDocument = await this.getInvoiceDocument(invoiceId, user);
    const actNumber = actNumberForInvoice(invoiceDocument.number);
    const title = `Акт оказанных услуг ${actNumber}`;
    const fileName = `${safeFileName(actNumber)}.html`;

    // Русский комментарий: акт строится из того же снимка счета, чтобы суммы и состав услуг не расходились между документами.
    return {
      ...invoiceDocument,
      documentKind: 'act' as const,
      actNumber,
      title,
      fileName,
      html: renderActHtml({
        ...invoiceDocument,
        documentKind: 'act',
        actNumber,
        title,
        fileName,
      }),
    };
  }
}

export type BillingPrintableDocument = InvoiceDocumentPayload & {
  html: string;
};

export type InvoiceDocumentPayload = {
  invoiceId: string;
  number: string;
  documentKind?: 'invoice' | 'act';
  actNumber?: string;
  title: string;
  fileName: string;
  status: BillingInvoiceStatus;
  statusLabel: string;
  periodFrom: string;
  periodTo: string;
  dueDate: string | null;
  issuedAt: string | null;
  totalRub: number;
  paidRub: number;
  remainingRub: number;
  comment: string | null;
  client: {
    id: string;
    code: string;
    name: string;
    inn: string | null;
    kpp: string | null;
    legalAddress: string | null;
    actualAddress: string | null;
    email: string | null;
    phone: string | null;
  };
  rows: Array<{
    position: number;
    description: string;
    unit: string;
    quantity: number;
    unitPriceRub: number;
    totalRub: number;
    serviceDate: string;
  }>;
  payments: Array<{
    id: string;
    amountRub: number;
    paidAt: string;
    method: string | null;
    reference: string | null;
    comment: string | null;
  }>;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
};

const invoiceDocumentInclude = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
      inn: true,
      kpp: true,
      legalAddress: true,
      actualAddress: true,
      email: true,
      phone: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  items: {
    orderBy: [{ serviceDate: 'asc' }, { id: 'asc' }],
  },
  payments: {
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
  },
} satisfies Prisma.BillingInvoiceInclude;

function renderInvoiceHtml(document: InvoiceDocumentPayload) {
  // Русский комментарий: HTML остается быстрым preview, а PDF строится отдельным сервисом из того же payload.
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(document.title)}</title>
  <style>
    body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 24px 0 10px; }
    .muted { color: #64748b; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 20px; }
    .box { border: 1px solid #d7dde5; border-radius: 6px; padding: 12px; }
    table { border-collapse: collapse; margin-top: 14px; width: 100%; }
    th, td { border-bottom: 1px solid #d7dde5; font-size: 13px; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; color: #334155; text-transform: uppercase; }
    .right { text-align: right; }
    .total { font-size: 16px; font-weight: 700; }
    @media print { body { margin: 16mm; } button { display: none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(document.title)}</h1>
  <p class="muted">Статус: ${escapeHtml(document.statusLabel)} · период ${formatDate(document.periodFrom)} - ${formatDate(document.periodTo)}</p>
  <div class="grid">
    <section class="box">
      <strong>Клиент</strong>
      <p>${escapeHtml(document.client.name)} (${escapeHtml(document.client.code)})</p>
      <p>ИНН: ${escapeHtml(document.client.inn ?? '-')} · КПП: ${escapeHtml(document.client.kpp ?? '-')}</p>
      <p>${escapeHtml(document.client.legalAddress ?? document.client.actualAddress ?? '-')}</p>
    </section>
    <section class="box">
      <strong>Документ</strong>
      <p>Выставлен: ${formatDate(document.issuedAt)}</p>
      <p>Оплатить до: ${formatDate(document.dueDate)}</p>
      <p>Ответственный: ${escapeHtml(document.createdBy?.name ?? '-')}</p>
    </section>
  </div>
  <h2>Позиции</h2>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Услуга</th>
        <th>Дата</th>
        <th class="right">Кол-во</th>
        <th class="right">Цена</th>
        <th class="right">Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${document.rows
        .map(
          (row) => `<tr>
        <td>${row.position}</td>
        <td>${escapeHtml(row.description)}</td>
        <td>${formatDate(row.serviceDate)}</td>
        <td class="right">${formatNumber(row.quantity)}</td>
        <td class="right">${formatMoney(row.unitPriceRub)} ₽</td>
        <td class="right">${formatMoney(row.totalRub)} ₽</td>
      </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <p class="right total">Итого: ${formatMoney(document.totalRub)} ₽</p>
  <p class="right">Оплачено: ${formatMoney(document.paidRub)} ₽</p>
  <p class="right">К оплате: ${formatMoney(document.remainingRub)} ₽</p>
  ${
    document.payments.length
      ? `<h2>Оплаты</h2>
  <table>
    <thead><tr><th>Дата</th><th>Способ</th><th>Номер</th><th class="right">Сумма</th></tr></thead>
    <tbody>${document.payments
      .map(
        (payment) => `<tr>
      <td>${formatDate(payment.paidAt)}</td>
      <td>${escapeHtml(payment.method ?? '-')}</td>
      <td>${escapeHtml(payment.reference ?? '-')}</td>
      <td class="right">${formatMoney(payment.amountRub)} ₽</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`
      : ''
  }
</body>
</html>`;
}

function renderActHtml(document: InvoiceDocumentPayload) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(document.title)}</title>
  <style>
    body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 24px 0 10px; }
    .muted { color: #64748b; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 20px; }
    .box { border: 1px solid #d7dde5; border-radius: 6px; padding: 12px; }
    table { border-collapse: collapse; margin-top: 14px; width: 100%; }
    th, td { border-bottom: 1px solid #d7dde5; font-size: 13px; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; color: #334155; text-transform: uppercase; }
    .right { text-align: right; }
    .total { font-size: 16px; font-weight: 700; }
    .statement { line-height: 1.55; margin-top: 20px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 42px; }
    .signature-line { border-top: 1px solid #111827; margin-top: 42px; padding-top: 6px; }
    @media print { body { margin: 16mm; } button { display: none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(document.title)}</h1>
  <p class="muted">Основание: счет ${escapeHtml(document.number)} · период ${formatDate(document.periodFrom)} - ${formatDate(document.periodTo)}</p>
  <div class="grid">
    <section class="box">
      <strong>Заказчик</strong>
      <p>${escapeHtml(document.client.name)} (${escapeHtml(document.client.code)})</p>
      <p>ИНН: ${escapeHtml(document.client.inn ?? '-')} · КПП: ${escapeHtml(document.client.kpp ?? '-')}</p>
      <p>${escapeHtml(document.client.legalAddress ?? document.client.actualAddress ?? '-')}</p>
    </section>
    <section class="box">
      <strong>Исполнитель</strong>
      <p>LOGOFF Fulfillment WMS</p>
      <p>Дата акта: ${formatDate(document.issuedAt ?? new Date().toISOString())}</p>
      <p>Ответственный: ${escapeHtml(document.createdBy?.name ?? '-')}</p>
    </section>
  </div>
  <h2>Оказанные услуги</h2>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Услуга</th>
        <th>Дата</th>
        <th class="right">Кол-во</th>
        <th class="right">Цена</th>
        <th class="right">Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${document.rows
        .map(
          (row) => `<tr>
        <td>${row.position}</td>
        <td>${escapeHtml(row.description)}</td>
        <td>${formatDate(row.serviceDate)}</td>
        <td class="right">${formatNumber(row.quantity)}</td>
        <td class="right">${formatMoney(row.unitPriceRub)} руб.</td>
        <td class="right">${formatMoney(row.totalRub)} руб.</td>
      </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <p class="right total">Итого оказано услуг на сумму: ${formatMoney(document.totalRub)} руб.</p>
  <p class="statement">Услуги оказаны в полном объеме за указанный период. Стороны подтверждают состав и стоимость услуг по настоящему акту.</p>
  <div class="signatures">
    <section>
      <strong>Исполнитель</strong>
      <div class="signature-line">Подпись / расшифровка</div>
    </section>
    <section>
      <strong>Заказчик</strong>
      <div class="signature-line">Подпись / расшифровка</div>
    </section>
  </div>
</body>
</html>`;
}

function invoiceStatusLabel(status: BillingInvoiceStatus) {
  const labels: Record<BillingInvoiceStatus, string> = {
    DRAFT: 'Черновик',
    ISSUED: 'Выставлен',
    PAID: 'Оплачен',
    CANCELLED: 'Отменен',
  };
  return labels[status];
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function actNumberForInvoice(invoiceNumber: string) {
  return invoiceNumber.startsWith('INV-') ? `ACT-${invoiceNumber.slice(4)}` : `ACT-${invoiceNumber}`;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, '_');
}
