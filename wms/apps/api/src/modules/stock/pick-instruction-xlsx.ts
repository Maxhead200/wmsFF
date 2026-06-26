import * as XLSX from 'xlsx';
import type { PickInstructionDocument, PickInstructionRow } from './pick-instruction.types';

type CellValue = string | number;

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function buildPickInstructionWorkbook(document: PickInstructionDocument) {
  const workbook = XLSX.utils.book_new();

  // Русский комментарий: XLSX нужен кладовщику как рабочий файл, поэтому листы разделены по сценариям работы.
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(summaryRows(document), [24, 46]), 'Сводка');
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(instructionRows(document), [5, 7, 18, 18, 18, 18, 34, 12, 12, 12, 22, 42]), 'Инструкция');
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(boxRows(document), [20, 18, 14, 20, 10, 14, 34]), 'Короба');
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(shortageRows(document), [7, 18, 18, 34, 12, 12, 12, 22, 42]), 'Дефицит');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function pickInstructionXlsxMimeType() {
  return XLSX_MIME_TYPE;
}

function summaryRows(document: PickInstructionDocument): CellValue[][] {
  return [
    ['Параметр', 'Значение'],
    ['Заявка', document.requestTitle],
    ['Клиент', `${document.client.code} · ${document.client.name}`],
    ['Статус заявки', document.requestStatusLabel],
    ['Приоритет', document.priorityLabel],
    ['Желаемая дата', document.desiredDate ? formatDate(document.desiredDate) : '-'],
    ['Адрес', document.deliveryAddress ?? '-'],
    ['Строк', document.rowsCount],
    ['К сборке', document.totalRequested],
    ['В плане', document.totalAllocated],
    ['Дефицит', document.totalShortage],
    ['Коробов в плане', document.boxesCount],
    ['Целых коробов', document.fullBoxesCount],
    ['Сформировано', formatDateTime(document.generatedAt)],
  ];
}

function instructionRows(document: PickInstructionDocument): CellValue[][] {
  const rows: CellValue[][] = [
    ['✓', '№', 'Короб', 'Паллета', 'SKU', 'Баркод', 'Товар', 'Нужно', 'Взять', 'Дефицит', 'Статус', 'Комментарий'],
  ];

  for (const row of document.rows) {
    const allocations = row.allocations.length ? row.allocations : [null];
    allocations.forEach((allocation, index) => {
      rows.push([
        '',
        index === 0 ? row.position : '',
        allocation?.boxCode ?? '',
        allocation?.palletCode ?? '',
        row.internalSku ?? '',
        row.barcode ?? '',
        row.name ?? '',
        index === 0 ? row.requestedQuantity : '',
        allocation?.quantity ?? 0,
        index === 0 && row.shortageQuantity > 0 ? row.shortageQuantity : '',
        row.statusLabel,
        index === 0 ? row.comment ?? rowInstructionComment(row) : '',
      ]);
    });
  }

  if (rows.length === 1) {
    rows.push(['', '', '', '', '', '', 'В заявке нет строк для сборки.', '', '', '', '', '']);
  }

  return rows;
}

function boxRows(document: PickInstructionDocument): CellValue[][] {
  const rows: CellValue[][] = [
    ['Короб', 'Паллета', 'В плане', 'Доступно в коробе', 'Строк', 'Целый короб', 'Комментарий'],
  ];

  document.boxes.forEach((box) => {
    rows.push([
      box.boxCode,
      box.palletCode ?? '',
      box.allocatedQuantity,
      box.availableQuantity,
      box.linesCount,
      box.isFullBox ? 'Да' : 'Нет',
      box.comment,
    ]);
  });

  if (rows.length === 1) {
    rows.push(['', '', '', '', '', '', 'Нет коробов в плане.']);
  }

  return rows;
}

function shortageRows(document: PickInstructionDocument): CellValue[][] {
  const rows: CellValue[][] = [
    ['№', 'SKU', 'Баркод', 'Товар', 'Нужно', 'В плане', 'Дефицит', 'Статус', 'Комментарий'],
  ];

  document.rows
    .filter((row) => row.status !== 'READY')
    .forEach((row) => {
      rows.push([
        row.position,
        row.internalSku ?? '',
        row.barcode ?? '',
        row.name ?? '',
        row.requestedQuantity,
        row.allocatedQuantity,
        row.shortageQuantity,
        row.statusLabel,
        row.comment ?? '',
      ]);
    });

  if (rows.length === 1) {
    rows.push(['', '', '', '', '', '', '', 'Дефицита нет', '']);
  }

  return rows;
}

function sheetFromRows(rows: CellValue[][], widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map((width) => ({ wch: width }));
  return sheet;
}

function rowInstructionComment(row: PickInstructionRow) {
  if (row.allocations.length === 0) {
    return row.status === 'READY' ? '' : 'Нет доступного остатка в коробах.';
  }

  return row.allocations.length > 1 ? 'Отбор из нескольких коробов.' : '';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
