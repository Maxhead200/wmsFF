import type { SheetCell, SheetMatrix } from './stock-xlsx.parser';

export type ReceiptImportItem = {
  clientId: string;
  boxCode: string;
  barcode: string;
  kiz: string;
  name: string;
  color?: string;
  size?: string;
  quantity: 1;
  sourceRow: number;
};

export type ReceiptImportIssue = {
  row: number;
  message: string;
  severity: 'warning' | 'error';
};

type ReceiptColumnMap = {
  barcode: number;
  box: number;
  kiz: number;
  name: number;
  color: number;
  size: number;
};

const DEFAULT_COLUMNS: ReceiptColumnMap = {
  barcode: 0,
  box: 1,
  kiz: 2,
  name: 3,
  color: 4,
  size: 5,
};

export function parseReceiptSheet(rows: SheetMatrix, options: { clientId: string }) {
  const columns = detectColumns(rows);
  const items: ReceiptImportItem[] = [];
  const issues: ReceiptImportIssue[] = [];
  const kizInFile = new Map<string, number>();
  let currentBoxCode = '';

  rows.forEach((row, index) => {
    const sourceRow = index + 1;
    if (looksLikeHeader(row, columns)) {
      return;
    }

    const barcodeOrBox = text(row[columns.barcode]);
    const explicitBox = text(row[columns.box]);
    const kiz = text(row[columns.kiz]);
    const name = safeImportText(text(row[columns.name]));
    const color = safeImportText(text(row[columns.color]));
    const size = safeImportText(text(row[columns.size]));

    if (!barcodeOrBox && !explicitBox && !kiz && !name && !color && !size) {
      return;
    }

    if (looksLikeBoxCode(barcodeOrBox) && !kiz && !name && !color && !size) {
      currentBoxCode = barcodeOrBox;
      return;
    }

    const boxCode = explicitBox || currentBoxCode;
    const barcode = safeImportText(barcodeOrBox);

    if (!boxCode) {
      issues.push({ row: sourceRow, message: 'Не найден номер короба для строки приемки.', severity: 'error' });
      return;
    }
    if (!barcode) {
      issues.push({ row: sourceRow, message: 'Не заполнен баркод товара.', severity: 'error' });
      return;
    }
    if (!kiz) {
      issues.push({ row: sourceRow, message: 'Не заполнен КИЗ товара.', severity: 'error' });
      return;
    }
    if (!name) {
      issues.push({ row: sourceRow, message: 'Не заполнено наименование, будет создано временное имя.', severity: 'warning' });
    }

    const firstKizRow = kizInFile.get(kiz);
    if (firstKizRow) {
      issues.push({
        row: sourceRow,
        message: `КИЗ уже встречался в строке ${firstKizRow}.`,
        severity: 'error',
      });
    } else {
      kizInFile.set(kiz, sourceRow);
    }

    items.push({
      clientId: options.clientId,
      boxCode,
      barcode,
      kiz,
      name: name || `Не задано: ${barcode}`,
      color: color || undefined,
      size: size || undefined,
      quantity: 1,
      sourceRow,
    });
  });

  const boxes = new Set(items.map((item) => item.boxCode));
  const barcodes = new Set(items.map((item) => item.barcode));
  const uniqueKiz = new Set(items.map((item) => item.kiz));

  return {
    items,
    issues,
    summary: {
      rows: items.length,
      boxes: boxes.size,
      barcodes: barcodes.size,
      kiz: uniqueKiz.size,
      totalQuantity: items.length,
    },
  };
}

function detectColumns(rows: SheetMatrix): ReceiptColumnMap {
  for (const row of rows) {
    const normalized = Array.from(row, (cell) => text(cell).toLowerCase());
    if (!normalized.some((cell) => cell.includes('к')) || !normalized.some((cell) => cell.includes('баркод'))) {
      continue;
    }

    return {
      barcode: findColumn(normalized, ['баркод', 'шк']) ?? DEFAULT_COLUMNS.barcode,
      box: findColumn(normalized, ['короб']) ?? DEFAULT_COLUMNS.box,
      kiz: findColumn(normalized, ['киз']) ?? DEFAULT_COLUMNS.kiz,
      name: findColumn(normalized, ['артикул', 'наименование']) ?? DEFAULT_COLUMNS.name,
      color: findColumn(normalized, ['цвет']) ?? DEFAULT_COLUMNS.color,
      size: findColumn(normalized, ['размер']) ?? DEFAULT_COLUMNS.size,
    };
  }

  return DEFAULT_COLUMNS;
}

function findColumn(cells: string[], needles: string[]) {
  const index = cells.findIndex((cell) => needles.some((needle) => (cell ?? '').includes(needle)));
  return index >= 0 ? index : undefined;
}

function looksLikeHeader(row: SheetCell[], columns: ReceiptColumnMap) {
  const barcodeHeader = text(row[columns.barcode]).toLowerCase();
  const kizHeader = text(row[columns.kiz]).toLowerCase();
  return barcodeHeader.includes('баркод') || barcodeHeader.includes('шк/') || kizHeader.includes('киз');
}

function looksLikeBoxCode(value: string) {
  return /^FFL[_-]/i.test(value) || /^BOX[_-]/i.test(value) || /^короб/i.test(value);
}

function safeImportText(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.toUpperCase() === '#N/A' || normalized.toUpperCase() === 'N/A') {
    return '';
  }
  return normalized;
}

function text(value: SheetCell) {
  return value == null ? '' : String(value).trim();
}
