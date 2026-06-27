import type { ClientSummary, StockBalance } from '../../lib/api';
import { formatCabinetDate, formatCabinetNumber, primaryBarcode, stockStatusLabel } from './clientCabinetFormat';

export function downloadClientCabinetStockExcel(client: ClientSummary, stock: StockBalance[], canSeeStoragePlaces: boolean) {
  const stockHeader = canSeeStoragePlaces
    ? ['SKU', 'Наименование', 'Штрихкод', 'Короб', 'Паллета', 'Статус', 'Количество', 'Обновлено']
    : ['SKU', 'Наименование', 'Штрихкод', 'Статус', 'Количество', 'Обновлено'];
  const stockRows = stock.map((balance) => {
    const storagePlaces = canSeeStoragePlaces ? [balance.box?.code ?? '', balance.pallet?.code ?? ''] : [];

    return [
      balance.sku.internalSku,
      balance.sku.name,
      primaryBarcode(balance),
      ...storagePlaces,
      stockStatusLabel(balance.status),
      formatCabinetNumber(Number(balance.quantity)),
      formatCabinetDate(balance.updatedAt),
    ];
  });

  const rows = [
    ['Клиент', client.code, client.name],
    ['Дата выгрузки', new Date().toLocaleString('ru-RU')],
    ['Строк остатков', stock.length],
    [],
    stockHeader,
    ...stockRows,
  ];

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
  <table>${rows.map((row, index) => rowHtml(row, index === 4)).join('')}</table>
</body>
</html>`;

  downloadExcelHtml(stockExcelFileName(client.code), html);
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
