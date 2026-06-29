import type { SheetCell, SheetMatrix, StockImportIssue } from './stock-xlsx.parser';

export type BoxTransferImportItem = {
  clientId: string;
  fromBoxCode: string;
  barcode: string;
  toBoxCode: string;
  quantity: number;
  legalName?: string;
  sourceRow: number;
};

export type BoxTransferImportSummary = {
  rows: number;
  sourceBoxes: number;
  targetBoxes: number;
  barcodes: number;
  totalQuantity: number;
};

export function parseBoxTransferSheet(rows: SheetMatrix, options: { clientId: string }) {
  const items: BoxTransferImportItem[] = [];
  const issues: StockImportIssue[] = [];
  let currentFromBox = '';
  let currentToBox = '';
  let endedAtRow = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const sourceRow = index + 1;
    const fromBox = text(row[0]);
    const barcode = text(row[1]);
    const toBox = text(row[2]);
    const quantityText = text(row[3]);
    const quantity = numberValue(row[3]);
    const legalName = text(row[4]);
    const hasMainCells = Boolean(fromBox || barcode || toBox);
    const hasAnyTransferCell = Boolean(fromBox || barcode || toBox || quantityText || legalName);

    if (looksLikeHeader(row)) {
      continue;
    }

    if (!hasMainCells) {
      const nextDataRow = findNextMainDataRow(rows, index + 1, 5);
      if (nextDataRow) {
        issues.push({
          row: nextDataRow,
          message: `После пустой строки ${sourceRow} снова найдены данные. Проверьте шаблон: пустая строка в первых трех столбцах считается концом перемещений.`,
          severity: 'error',
        });
      }
      endedAtRow = sourceRow;
      break;
    }

    if (fromBox) {
      currentFromBox = fromBox;
    }
    if (toBox) {
      currentToBox = toBox;
    }

    if (!hasAnyTransferCell) {
      continue;
    }

    if (!barcode) {
      issues.push({ row: sourceRow, message: 'Не указан баркод товара для перемещения.', severity: 'error' });
      continue;
    }

    if (!currentFromBox) {
      issues.push({ row: sourceRow, message: 'Не указан короб, из которого берем товар.', severity: 'error' });
      continue;
    }

    if (!currentToBox) {
      issues.push({ row: sourceRow, message: 'Не указан короб, в который делаем перемещение.', severity: 'error' });
      continue;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      issues.push({
        row: sourceRow,
        message: 'Не указано количество перемещаемого товара или оно не является положительным целым числом.',
        severity: 'error',
      });
      continue;
    }

    items.push({
      clientId: options.clientId,
      fromBoxCode: currentFromBox,
      barcode,
      toBoxCode: currentToBox,
      quantity,
      legalName: legalName || undefined,
      sourceRow,
    });
  }

  if (rows.length > 0 && endedAtRow === 0 && items.length === 0 && issues.length === 0) {
    issues.push({ row: 1, message: 'В файле не найдены строки перемещений.', severity: 'error' });
  }

  return {
    items,
    issues,
    summary: boxTransferSummary(items),
  };
}

export function boxTransferSummary(items: BoxTransferImportItem[]): BoxTransferImportSummary {
  return {
    rows: items.length,
    sourceBoxes: new Set(items.map((item) => item.fromBoxCode)).size,
    targetBoxes: new Set(items.map((item) => item.toBoxCode)).size,
    barcodes: new Set(items.map((item) => item.barcode)).size,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

function findNextMainDataRow(rows: SheetMatrix, startIndex: number, lookAhead: number) {
  const endIndex = Math.min(rows.length, startIndex + lookAhead);
  for (let index = startIndex; index < endIndex; index += 1) {
    const row = rows[index] ?? [];
    if (text(row[0]) || text(row[1]) || text(row[2])) {
      return index + 1;
    }
  }
  return 0;
}

function looksLikeHeader(row: SheetCell[]) {
  const first = text(row[0]).toLowerCase();
  const second = text(row[1]).toLowerCase();
  const third = text(row[2]).toLowerCase();
  return (
    first.includes('откуда') ||
    first.includes('короб') ||
    second.includes('баркод') ||
    second.includes('штрих') ||
    third.includes('куда')
  );
}

function text(value: SheetCell) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value: SheetCell) {
  if (value == null || value === '') {
    return 0;
  }

  const parsed = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
