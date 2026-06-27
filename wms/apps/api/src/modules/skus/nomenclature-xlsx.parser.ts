export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetMatrix = SheetCell[][];

export type NomenclatureImportItem = {
  clientId: string;
  internalSku: string;
  clientSku?: string;
  article?: string;
  barcode?: string;
  name: string;
  color?: string;
  size?: string;
  sourceRow: number;
};

export type NomenclatureImportIssue = {
  row: number;
  internalSku?: string;
  name?: string;
  message: string;
  severity: 'warning' | 'error';
};

export type NomenclatureParseOptions = {
  clientId: string;
};

type NomenclatureColumnMap = {
  name: number;
  printName: number;
  article: number;
  barcode: number;
  clientSku: number;
  color: number;
  size: number;
};

const MISSING_COLUMN = -1;

const DEFAULT_COLUMNS: NomenclatureColumnMap = {
  name: 0,
  printName: 3,
  article: 1,
  barcode: MISSING_COLUMN,
  clientSku: MISSING_COLUMN,
  color: MISSING_COLUMN,
  size: MISSING_COLUMN,
};

export function parseNomenclatureSheet(rows: SheetMatrix, options: NomenclatureParseOptions) {
  const items: NomenclatureImportItem[] = [];
  const issues: NomenclatureImportIssue[] = [];
  const columns = detectColumns(rows);
  const seenKeys = new Set<string>();

  rows.forEach((row, index) => {
    const sourceRow = index + 1;
    if (looksLikeHeader(row)) {
      return;
    }

    const name = valueAt(row, columns.name) || valueAt(row, columns.printName);
    const article = valueAt(row, columns.article);
    const barcode = valueAt(row, columns.barcode);
    const clientSku = valueAt(row, columns.clientSku);
    const color = valueAt(row, columns.color);
    const size = valueAt(row, columns.size);

    if (!name && !article && !barcode && !clientSku) {
      return;
    }

    if (!name) {
      issues.push({
        row: sourceRow,
        message: 'Не заполнено наименование товара.',
        severity: 'error',
      });
      return;
    }

    const internalSku = buildInternalSku(article || clientSku || barcode || name);
    const dedupeKey = `${internalSku}|${barcode}`;
    if (seenKeys.has(dedupeKey)) {
      issues.push({
        row: sourceRow,
        internalSku,
        name,
        message: 'Дубль номенклатуры в файле, строка пропущена.',
        severity: 'warning',
      });
      return;
    }
    seenKeys.add(dedupeKey);

    items.push({
      clientId: options.clientId,
      internalSku,
      clientSku: clientSku || undefined,
      article: article || undefined,
      barcode: barcode || undefined,
      name,
      color: color || undefined,
      size: size || undefined,
      sourceRow,
    });
  });

  return {
    items,
    issues,
    summary: {
      sourceRows: Math.max(rows.length - 1, 0),
      rows: items.length,
      barcodes: new Set(items.map((item) => item.barcode).filter(Boolean)).size,
    },
  };
}

function detectColumns(rows: SheetMatrix): NomenclatureColumnMap {
  for (const row of rows) {
    const normalized = row.map((cell) => normalizeHeader(text(cell)));
    if (!normalized.some((cell) => cell.includes('наименование') || cell.includes('номенклатура'))) {
      continue;
    }

    return {
      name: findColumn(normalized, ['наименование', 'номенклатура', 'товар', 'название']) ?? DEFAULT_COLUMNS.name,
      printName: findColumn(normalized, ['наименование для печати', 'печати']) ?? DEFAULT_COLUMNS.printName,
      article: findColumn(normalized, ['артикул', 'код', 'внутренний sku']) ?? DEFAULT_COLUMNS.article,
      barcode: findColumn(normalized, ['штрихкод', 'штрих код', 'баркод', 'шк']) ?? DEFAULT_COLUMNS.barcode,
      clientSku: findColumn(normalized, ['sku клиента', 'артикул клиента']) ?? DEFAULT_COLUMNS.clientSku,
      color: findColumn(normalized, ['цвет']) ?? DEFAULT_COLUMNS.color,
      size: findColumn(normalized, ['размер']) ?? DEFAULT_COLUMNS.size,
    };
  }

  return DEFAULT_COLUMNS;
}

function findColumn(cells: string[], needles: string[]) {
  const index = cells.findIndex((cell) => needles.some((needle) => cell.includes(needle)));
  return index >= 0 ? index : undefined;
}

function looksLikeHeader(row: SheetCell[]) {
  const normalized = row.map((cell) => normalizeHeader(text(cell)));
  return normalized.some((cell) => cell.includes('наименование')) && normalized.some((cell) => cell.includes('артикул'));
}

function valueAt(row: SheetCell[], index: number) {
  if (index < 0) {
    return '';
  }

  return cleanText(row[index]);
}

function cleanText(value: SheetCell) {
  const normalized = text(value);
  if (!normalized || normalized === '#N/A' || normalized.toUpperCase() === 'N/A') {
    return '';
  }

  return normalized;
}

function text(value: SheetCell) {
  return value == null ? '' : String(value).trim();
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildInternalSku(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= 100) {
    return compact;
  }

  return `${compact.slice(0, 83)}-${hashText(compact)}`;
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}
