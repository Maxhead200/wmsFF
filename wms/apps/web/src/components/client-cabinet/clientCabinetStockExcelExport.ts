import type { ClientSummary, StockBalance } from '../../lib/api';
import { formatCabinetDate, formatCabinetNumber, primaryBarcode, stockStatusLabel } from './clientCabinetFormat';

export function downloadClientCabinetStockExcel(client: ClientSummary, stock: StockBalance[], canSeeStoragePlaces: boolean) {
  const stockHeader = ['SKU', 'Наименование', 'Штрихкод', 'Статус', 'Количество', 'Обновлено'];
  const stockRows = aggregateStockRows(stock).map((row) => [
    row.internalSku,
    row.name,
    row.barcode,
    row.status,
    formatCabinetNumber(row.quantity),
    formatCabinetDate(row.updatedAt),
  ]);

  const rows = [
    ['Клиент', client.name],
    ['Дата выгрузки', new Date().toLocaleString('ru-RU')],
    ['Строк остатков', stockRows.length],
    ['Единиц на остатке', formatCabinetNumber(stock.reduce((sum, balance) => sum + Number(balance.quantity), 0))],
    [],
    stockHeader,
    ...stockRows,
  ];
  const headerRowIndex = rows.indexOf(stockHeader);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; mso-number-format:"\\@"; }
    th { background: #f1f5f9; font-weight: 700; }
  </style>
</head>
<body>
  <table>${rows.map((row, index) => rowHtml(row, index === headerRowIndex)).join('')}</table>
</body>
</html>`;

  downloadExcelHtml(stockExcelFileName(client.code), html);
}

type AggregatedStockRow = {
  internalSku: string;
  name: string;
  barcode: string;
  status: string;
  quantity: number;
  updatedAt: string;
};

function aggregateStockRows(stock: StockBalance[]) {
  const byBarcode = new Map<string, AggregatedStockRow & { internalSkus: Set<string>; names: Set<string>; statuses: Set<string> }>();

  stock.forEach((balance) => {
    const barcode = primaryBarcode(balance) || `SKU:${balance.sku.id}`;
    const existing = byBarcode.get(barcode) ?? {
      internalSku: '',
      name: '',
      barcode: primaryBarcode(balance) || '',
      status: '',
      quantity: 0,
      updatedAt: balance.updatedAt,
      internalSkus: new Set<string>(),
      names: new Set<string>(),
      statuses: new Set<string>(),
    };

    existing.internalSkus.add(balance.sku.internalSku);
    existing.names.add(balance.sku.name);
    existing.statuses.add(stockStatusLabel(balance.status));
    existing.quantity += Number(balance.quantity);
    existing.updatedAt = latestDateString(existing.updatedAt, balance.updatedAt);
    existing.internalSku = [...existing.internalSkus].sort((left, right) => left.localeCompare(right, 'ru')).join(', ');
    existing.name = [...existing.names].sort((left, right) => left.localeCompare(right, 'ru')).join(', ');
    existing.status = [...existing.statuses].sort((left, right) => left.localeCompare(right, 'ru')).join(', ');

    byBarcode.set(barcode, existing);
  });

  return [...byBarcode.values()]
    .map(({ internalSkus, names, statuses, ...row }) => row)
    .sort((left, right) => left.name.localeCompare(right.name, 'ru') || left.barcode.localeCompare(right.barcode, 'ru'));
}

function latestDateString(left: string, right: string) {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function rowHtml(row: Array<string | number>, isHeader: boolean) {
  const tag = isHeader ? 'th' : 'td';
  return `<tr>${row.map((cell) => `<${tag}>${escapeHtml(String(cell))}</${tag}>`).join('')}</tr>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stockExcelFileName(clientCode: string) {
  const safeClient = clientCode.replace(/[\\/:*?"<>|]/g, '_') || 'client';
  return `ostatki-${safeClient}-${new Date().toISOString().slice(0, 10)}.xls`;
}

function downloadExcelHtml(fileName: string, html: string) {
  const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
