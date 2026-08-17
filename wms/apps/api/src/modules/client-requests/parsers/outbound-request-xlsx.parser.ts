export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetMatrix = SheetCell[][];

export type OutboundRequestXlsxLine = {
  barcode?: string;
  name?: string;
  quantity: number;
  relabelTargetBarcode?: string;
  relabelQuantity?: number;
  city?: string;
  artSeller?: string;
  size?: string;
  sourceRows: number[];
};

export type OutboundRequestXlsxIssue = {
  row: number;
  barcode?: string;
  message: string;
  severity: 'warning' | 'error';
};

export const MAX_OUTBOUND_REQUEST_XLSX_LINES = 1000;

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
  if (columns.cityColumns.length > 0) {
    return parseDistributionRows(rows, columns, startIndex, firstRowIndex);
  }

  const lineByBarcode = new Map<string, OutboundRequestXlsxLine>();

  rows.slice(startIndex).forEach((row, offset) => {
    const sourceRow = startIndex + offset + 1;
    if (!row.some((cell) => text(cell))) {
      return;
    }
    if (looksLikeHeader(row)) {
      return;
    }

    const barcode = columns.barcodeColumn >= 0 ? normalizeBarcode(row[columns.barcodeColumn]) : '';
    const relabelTargetBarcode = columns.relabelColumn >= 0 ? normalizeBarcode(row[columns.relabelColumn]) : '';
    const artSeller = columns.articleColumn >= 0 ? text(row[columns.articleColumn]) : '';
    const name = columns.nameColumn >= 0 ? text(row[columns.nameColumn]) : '';
    const size = columns.sizeColumn >= 0 ? normalizeSize(row[columns.sizeColumn]) : '';
    const quantity = numberValue(row[columns.quantityColumn]);
    const relabelQuantity = columns.relabelQuantityColumn >= 0 ? numberValue(row[columns.relabelQuantityColumn]) : 0;

    if (!barcode && !name && !artSeller) {
      issues.push({ row: sourceRow, message: missingProductMessage(columns), severity: 'error' });
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      issues.push({
        row: sourceRow,
        barcode: barcode || undefined,
        message: 'Количество должно быть целым числом больше нуля.',
        severity: 'error',
      });
      return;
    }

    if ((relabelTargetBarcode || relabelQuantity) && !relabelTargetBarcode) {
      issues.push({
        row: sourceRow,
        barcode: barcode || undefined,
        message: 'Для перемаркировки укажите новый баркод.',
        severity: 'error',
      });
      return;
    }

    if (relabelTargetBarcode && (!Number.isInteger(relabelQuantity) || relabelQuantity <= 0 || relabelQuantity > quantity)) {
      issues.push({
        row: sourceRow,
        barcode: barcode || undefined,
        message: 'Количество перемаркировки должно быть целым числом больше нуля и не больше количества к отгрузке.',
        severity: 'error',
      });
      return;
    }

    if (relabelTargetBarcode && relabelTargetBarcode === barcode) {
      issues.push({
        row: sourceRow,
        barcode: barcode || undefined,
        message: 'Баркод перемаркировки должен отличаться от исходного баркода.',
        severity: 'error',
      });
      return;
    }

    const key = [barcode, name, artSeller, size, relabelTargetBarcode].join('\u0001');
    const existing = lineByBarcode.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.relabelQuantity = (existing.relabelQuantity ?? 0) + relabelQuantity || undefined;
      existing.sourceRows.push(sourceRow);
      return;
    }

    lineByBarcode.set(key, {
      ...(barcode ? { barcode } : {}),
      ...(name ? { name } : {}),
      ...(artSeller ? { artSeller } : {}),
      ...(size ? { size } : {}),
      ...(relabelTargetBarcode ? { relabelTargetBarcode } : {}),
      ...(relabelQuantity ? { relabelQuantity } : {}),
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
  const relabelColumn = findColumn(row, isRelabelHeader);
  const relabelQuantityColumn =
    relabelColumn === -1
      ? -1
      : row.findIndex((cell, index) => index > relabelColumn && isQuantityHeader(normalizeHeader(cell)));
  const articleColumn = findColumn(row, isArticleHeader);
  const nameColumn = findColumn(row, (value) => isNameHeader(value) && !isBarcodeHeader(value) && !isArticleHeader(value));
  const sizeColumn = findColumn(row, isSizeHeader);
  const productColumn = articleColumn !== -1 ? articleColumn : nameColumn;
  const cityStartColumn = Math.max(barcodeColumn, productColumn, sizeColumn);
  const cityColumns =
    productColumn !== -1 && quantityColumn === -1
      ? row
          .map((cell, index) => ({ title: text(cell), index }))
          .filter((column) => column.index > cityStartColumn && column.title)
      : [];

  if ((barcodeColumn !== -1 || productColumn !== -1) && quantityColumn !== -1) {
    return {
      hasHeader: true,
      barcodeColumn,
      quantityColumn,
      relabelColumn,
      relabelQuantityColumn,
      articleColumn,
      nameColumn,
      sizeColumn,
      cityColumns: [] as Array<{ title: string; index: number }>,
    };
  }

  if ((barcodeColumn !== -1 || productColumn !== -1) && cityColumns.length > 0) {
    return {
      hasHeader: true,
      barcodeColumn,
      quantityColumn: -1,
      relabelColumn: -1,
      relabelQuantityColumn: -1,
      articleColumn,
      nameColumn,
      sizeColumn,
      cityColumns,
    };
  }

  // Русский комментарий: если заголовков нет, считаем, что первые две колонки - баркод и количество.
  return {
    hasHeader: false,
    barcodeColumn: 0,
    quantityColumn: 1,
    relabelColumn: 2,
    relabelQuantityColumn: 3,
    articleColumn: -1,
    nameColumn: -1,
    sizeColumn: -1,
    cityColumns: [] as Array<{ title: string; index: number }>,
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

function isRelabelHeader(value: string) {
  return value.includes('перемар') || value.includes('перекле') || value.includes('relabel') || value.includes('новый баркод');
}

function isArticleHeader(value: string) {
  return value.includes('article') || value.includes('sku') || value.includes('артикул');
}

function isNameHeader(value: string) {
  return value.includes('name') || value.includes('наимен') || value.includes('товар') || value.includes('номенклат');
}

function isSizeHeader(value: string) {
  return value.includes('size') || value.includes('размер');
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

function parseDistributionRows(
  rows: SheetMatrix,
  columns: ReturnType<typeof detectColumns>,
  startIndex: number,
  firstRowIndex: number,
) {
  const issues: OutboundRequestXlsxIssue[] = [];
  const lineByKey = new Map<string, OutboundRequestXlsxLine>();

  rows.slice(startIndex).forEach((row, offset) => {
    const sourceRow = startIndex + offset + 1;
    if (!row.some((cell) => text(cell))) {
      return;
    }
    if (looksLikeHeader(row)) {
      return;
    }

    const barcode = columns.barcodeColumn >= 0 ? normalizeBarcode(row[columns.barcodeColumn]) : '';
    const artSeller = columns.articleColumn >= 0 ? text(row[columns.articleColumn]) : '';
    const name = columns.nameColumn >= 0 ? text(row[columns.nameColumn]) : '';
    const size = columns.sizeColumn >= 0 ? normalizeSize(row[columns.sizeColumn]) : '';

    if (!barcode && !name && !artSeller) {
      if (columns.cityColumns.some((column) => numberValue(row[column.index]) > 0)) {
        issues.push({ row: sourceRow, message: missingProductMessage(columns), severity: 'error' });
      }
      return;
    }

    for (const cityColumn of columns.cityColumns) {
      const quantity = numberValue(row[cityColumn.index]);
      if (!quantity) {
        continue;
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        issues.push({
          row: sourceRow,
          barcode: barcode || undefined,
          message: 'Количество должно быть целым числом больше нуля.',
          severity: 'error',
        });
        continue;
      }

      const city = cityColumn.title.trim();
      const key = [barcode, name, city, artSeller, size].join('\u0001');
      const existing = lineByKey.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.sourceRows.push(sourceRow);
        continue;
      }

      lineByKey.set(key, {
        ...(barcode ? { barcode } : {}),
        ...(name ? { name } : {}),
        quantity,
        city,
        artSeller,
        ...(size ? { size } : {}),
        sourceRows: [sourceRow],
      });
    }
  });

  const lines = [...lineByKey.values()];
  if (lines.length === 0 && issues.every((issue) => issue.severity !== 'error')) {
    issues.push({ row: firstRowIndex + 1, message: 'В файле нет строк для сборки.', severity: 'error' });
  }

  if (lines.length > MAX_OUTBOUND_REQUEST_XLSX_LINES) {
    issues.push({
      row: 1,
      message: `В одной заявке можно загрузить не больше ${MAX_OUTBOUND_REQUEST_XLSX_LINES} уникальных строк.`,
      severity: 'error',
    });
  }

  return {
    lines,
    issues,
    summary: {
      sourceRows: rows.length,
      lines: lines.length,
      totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    },
  };
}

function normalizeSize(value: SheetCell) {
  const raw = text(value).toUpperCase().replace(/М/g, 'M').replace(/Х/g, 'X');
  const match = raw.match(/\(([^)]+)\)/);
  return (match?.[1] ?? raw).replace(/\s+/g, '');
}

function missingProductMessage(columns: ReturnType<typeof detectColumns>) {
  return columns.barcodeColumn >= 0 && columns.articleColumn === -1 && columns.nameColumn === -1
    ? 'Не заполнен баркод товара.'
    : 'Не заполнен товар или баркод.';
}

function emptySummary() {
  return {
    sourceRows: 0,
    lines: 0,
    totalQuantity: 0,
  };
}
