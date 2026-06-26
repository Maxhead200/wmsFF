export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetMatrix = SheetCell[][];

export type StockImportItem = {
  clientId: string;
  boxCode: string;
  barcode: string;
  name: string;
  color?: string;
  size?: string;
  quantity: number;
  sourceRow: number;
};

export type StockImportIssue = {
  row: number;
  message: string;
  severity: 'warning' | 'error';
};

export type StockParseOptions = {
  clientId: string;
};

export function parseStockSheet(rows: SheetMatrix, options: StockParseOptions) {
  const items: StockImportItem[] = [];
  const issues: StockImportIssue[] = [];
  let currentBoxCode = '';

  rows.forEach((row, index) => {
    const sourceRow = index + 1;
    const boxCode = text(row[0]);
    const barcode = text(row[3]);
    const name = text(row[4]);
    const color = text(row[6]);
    const size = text(row[7]);
    const quantity = numberValue(row[8]);

    if (looksLikeHeader(row)) {
      return;
    }

    if (boxCode && !barcode && !name && !quantity) {
      // Русский комментарий: в примере короб идёт отдельной строкой-заголовком перед товарами.
      currentBoxCode = boxCode;
      return;
    }

    const effectiveBox = boxCode || currentBoxCode;
    if (!barcode && !name && !quantity) {
      return;
    }

    if (!effectiveBox) {
      issues.push({ row: sourceRow, message: 'Не найден короб для строки остатка.', severity: 'error' });
      return;
    }

    if (!barcode || barcode === '#N/A') {
      issues.push({ row: sourceRow, message: 'Не заполнен штрихкод.', severity: 'error' });
      return;
    }

    if (!quantity || quantity < 0) {
      issues.push({ row: sourceRow, message: 'Количество должно быть положительным числом.', severity: 'error' });
      return;
    }

    const safeName = name || `Не задано: ${barcode}`;
    if (!name) {
      // Русский комментарий: для первичного seed не теряем остаток, но явно показываем, что карточку надо дозаполнить.
      issues.push({ row: sourceRow, message: 'Не заполнено наименование, создано временное имя.', severity: 'warning' });
    }

    items.push({
      clientId: options.clientId,
      boxCode: effectiveBox,
      barcode,
      name: safeName,
      color: color || undefined,
      size: size || undefined,
      quantity,
      sourceRow,
    });
  });

  const uniqueBoxes = new Set(items.map((item) => item.boxCode));
  const uniqueBarcodes = new Set(items.map((item) => item.barcode));
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    issues,
    summary: {
      rows: items.length,
      boxes: uniqueBoxes.size,
      barcodes: uniqueBarcodes.size,
      totalQuantity,
    },
  };
}

function looksLikeHeader(row: SheetCell[]) {
  return text(row[0]).toLowerCase() === 'короб' || text(row[3]).toLowerCase().includes('штрих');
}

function text(value: SheetCell) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value: SheetCell) {
  if (value == null || value === '') {
    return 0;
  }

  const normalized = String(value).replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
