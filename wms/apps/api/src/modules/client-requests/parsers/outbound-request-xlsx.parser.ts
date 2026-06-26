export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetMatrix = SheetCell[][];

export type OutboundRequestXlsxLine = {
  barcode: string;
  quantity: number;
  sourceRows: number[];
};

export type OutboundRequestXlsxIssue = {
  row: number;
  barcode?: string;
  message: string;
  severity: 'warning' | 'error';
};

export const MAX_OUTBOUND_REQUEST_XLSX_LINES = 100;

export function parseOutboundRequestXlsxRows(rows: SheetMatrix) {
  const issues: OutboundRequestXlsxIssue[] = [];
  const firstRowIndex = rows.findIndex((row) => row.some((cell) => text(cell)));

  if (firstRowIndex === -1) {
    return {
      lines: [],
      issues: [{ row: 1, message: 'Файл пустой.', severity: 'error' as const }],
      summary: emptySummary(),
    };
  }

  const columns = detectColumns(rows[firstRowIndex]);
  const startIndex = columns.hasHeader ? firstRowIndex + 1 : firstRowIndex;
  const lineByBarcode = new Map<string, OutboundRequestXlsxLine>();

  rows.slice(startIndex).forEach((row, offset) => {
    const sourceRow = startIndex + offset + 1;
    if (!row.some((cell) => text(cell))) {
      return;
    }
    if (looksLikeHeader(row)) {
      return;
    }

    const barcode = normalizeBarcode(row[columns.barcodeColumn]);
    const quantity = numberValue(row[columns.quantityColumn]);

    if (!barcode) {
      issues.push({ row: sourceRow, message: 'Не заполнен баркод товара.', severity: 'error' });
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      issues.push({ row: sourceRow, barcode, message: 'Количество должно быть целым числом больше нуля.', severity: 'error' });
      return;
    }

    const existing = lineByBarcode.get(barcode);
    if (existing) {
      existing.quantity += quantity;
      existing.sourceRows.push(sourceRow);
      return;
    }

    lineByBarcode.set(barcode, {
      barcode,
      quantity,
      sourceRows: [sourceRow],
    });
  });

  const lines = [...lineByBarcode.values()];
  if (lines.length === 0 && issues.every((issue) => issue.severity !== 'error')) {
    issues.push({ row: firstRowIndex + 1, message: 'В файле нет строк для сборки.', severity: 'error' });
  }

  if (lines.length > MAX_OUTBOUND_REQUEST_XLSX_LINES) {
    issues.push({
      row: 1,
      message: `В одной заявке можно загрузить не больше ${MAX_OUTBOUND_REQUEST_XLSX_LINES} уникальных баркодов.`,
      severity: 'error',
    });
  }

  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  return {
    lines,
    issues,
    summary: {
      sourceRows: rows.length,
      lines: lines.length,
      totalQuantity,
    },
  };
}

function detectColumns(row: SheetCell[]) {
  const barcodeColumn = findColumn(row, isBarcodeHeader);
  const quantityColumn = findColumn(row, isQuantityHeader);

  if (barcodeColumn !== -1 && quantityColumn !== -1) {
    return {
      hasHeader: true,
      barcodeColumn,
      quantityColumn,
    };
  }

  // Русский комментарий: если заголовков нет, считаем, что первые две колонки - баркод и количество.
  return {
    hasHeader: false,
    barcodeColumn: 0,
    quantityColumn: 1,
  };
}

function looksLikeHeader(row: SheetCell[]) {
  return findColumn(row, isBarcodeHeader) !== -1 && findColumn(row, isQuantityHeader) !== -1;
}

function findColumn(row: SheetCell[], predicate: (value: string) => boolean) {
  return row.findIndex((cell) => predicate(normalizeHeader(cell)));
}

function isBarcodeHeader(value: string) {
  return value.includes('barcode') || value.includes('баркод') || value.includes('штрих') || value === 'шк';
}

function isQuantityHeader(value: string) {
  return value.includes('quantity') || value.includes('qty') || value.includes('кол') || value.includes('количество');
}

function normalizeHeader(value: SheetCell) {
  return text(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeBarcode(value: SheetCell) {
  const barcode = text(value).replace(/\.0$/, '');
  return barcode;
}

function text(value: SheetCell) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value: SheetCell) {
  if (value == null || value === '') {
    return 0;
  }

  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptySummary() {
  return {
    sourceRows: 0,
    lines: 0,
    totalQuantity: 0,
  };
}
