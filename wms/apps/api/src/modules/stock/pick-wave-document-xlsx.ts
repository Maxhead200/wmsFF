import * as XLSX from 'xlsx';
import type { PickWaveDocumentPayload, PickWaveDocumentRow, WaveAllocation } from './pick-wave-document.types';

type CellValue = string | number;

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function buildPickWaveWorkbook(document: PickWaveDocumentPayload) {
  const workbook = XLSX.utils.book_new();

  // Русский комментарий: лист волны нужен для batch picking, поэтому разделяем сводку, маршрут и контроль проблем.
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(summaryRows(document), [24, 46]), 'Сводка');
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(routeRows(document), [5, 7, 18, 22, 16, 18, 34, 18, 12, 12, 18, 22, 34]), 'Маршрут');
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(boxRows(document), [20, 18, 16, 14, 14, 14, 42]), 'Короба');
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(problemRows(document), [7, 18, 22, 16, 18, 34, 12, 12, 12, 42]), 'Проблемы');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function pickWaveXlsxMimeType() {
  return XLSX_MIME_TYPE;
}

function summaryRows(document: PickWaveDocumentPayload): CellValue[][] {
  const plannedQuantity = plannedOrPickedTotal(document.rows);
  const problems = problemDocumentRows(document.rows);

  return [
    ['Параметр', 'Значение'],
    ['Волна', document.waveNumber],
    ['Статус', document.statusLabel],
    ['Заявок', document.requestsCount],
    ['Строк', document.rowsCount],
    ['К сборке', document.totalRequested],
    ['В маршруте/факте', plannedQuantity],
    ['Собрано фактически', document.totalPicked],
    ['Проблемных строк', problems.length],
    ['Комментарий', document.comment ?? '-'],
    ['Создана', formatDateTime(document.createdAt)],
    ['Сформировано', formatDateTime(document.generatedAt)],
    ['Создал', document.createdBy?.name ?? document.createdBy?.email ?? '-'],
    ['Сборщик', document.assignedPicker?.name ?? document.assignedPicker?.email ?? 'не назначен'],
  ];
}

function routeRows(document: PickWaveDocumentPayload): CellValue[][] {
  const rows: CellValue[][] = [
    ['✓', '№', 'Волна', 'Заявка', 'Клиент', 'SKU', 'Товар', 'Баркод', 'Нужно', 'Взять', 'Источник', 'Короб/паллета', 'Статус'],
  ];

  document.rows.forEach((row) => {
    const allocations = row.allocations.length ? row.allocations : [null];
    allocations.forEach((allocation, index) => {
      rows.push([
        '',
        index === 0 ? row.position : '',
        document.waveNumber,
        row.requestTitle,
        `${row.clientCode} · ${row.clientName}`,
        row.internalSku ?? '',
        row.name ?? '',
        row.barcode ?? '',
        index === 0 ? row.requestedQuantity : '',
        allocation?.quantity ?? 0,
        allocation ? sourceLabel(allocation.source) : '',
        allocation ? locationLabel(allocation) : '',
        index === 0 ? rowStatus(row) : '',
      ]);
    });
  });

  if (rows.length === 1) {
    rows.push(['', '', document.waveNumber, '', '', '', 'В волне нет строк для сборки.', '', '', '', '', '', '']);
  }

  return rows;
}

function boxRows(document: PickWaveDocumentPayload): CellValue[][] {
  const groups = new Map<string, { allocation: WaveAllocation; rows: Set<number>; quantity: number }>();

  document.rows.forEach((row) => {
    row.allocations.forEach((allocation) => {
      const key = `${allocation.source}:${allocation.boxCode ?? allocation.boxId ?? ''}:${allocation.palletCode ?? allocation.palletId ?? ''}`;
      const group = groups.get(key) ?? { allocation, rows: new Set<number>(), quantity: 0 };
      group.rows.add(row.position);
      group.quantity += allocation.quantity;
      groups.set(key, group);
    });
  });

  const rows: CellValue[][] = [['Короб', 'Паллета', 'Источник', 'Количество', 'Строк', 'Позиции', 'Комментарий']];
  [...groups.values()]
    .sort((left, right) => locationLabel(left.allocation).localeCompare(locationLabel(right.allocation), 'ru'))
    .forEach((group) => {
      rows.push([
        group.allocation.boxCode ?? group.allocation.boxId ?? '',
        group.allocation.palletCode ?? group.allocation.palletId ?? '',
        sourceLabel(group.allocation.source),
        group.quantity,
        group.rows.size,
        [...group.rows].sort((left, right) => left - right).join(', '),
        group.allocation.source === 'picked' ? 'Фактическая аллокация после запуска волны' : 'Плановая подсказка из AVAILABLE',
      ]);
    });

  if (rows.length === 1) {
    rows.push(['', '', '', '', '', '', 'Нет коробов в маршруте.']);
  }

  return rows;
}

function problemRows(document: PickWaveDocumentPayload): CellValue[][] {
  const rows: CellValue[][] = [['№', 'Волна', 'Заявка', 'Клиент', 'SKU', 'Товар', 'Нужно', 'В маршруте', 'Дефицит', 'Причина']];

  problemDocumentRows(document.rows).forEach((row) => {
      const routed = rowRoutedQuantity(row);
      rows.push([
        row.position,
        document.waveNumber,
        row.requestTitle,
        `${row.clientCode} · ${row.clientName}`,
        row.internalSku ?? '',
        row.name ?? '',
        row.requestedQuantity,
        routed,
        Math.max(0, row.requestedQuantity - routed),
        problemReason(row),
      ]);
    });

  if (rows.length === 1) {
    rows.push(['', document.waveNumber, '', '', '', '', '', '', '', 'Проблем нет.']);
  }

  return rows;
}

function problemDocumentRows(rows: PickWaveDocumentRow[]) {
  return rows.filter((row) => rowProblemQuantity(row) > 0 || !row.skuId);
}

function sheetFromRows(rows: CellValue[][], widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map((width) => ({ wch: width }));
  return sheet;
}

function rowRoutedQuantity(row: PickWaveDocumentRow) {
  if (row.pickedQuantity > 0) {
    return row.pickedQuantity;
  }

  return row.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
}

function plannedOrPickedTotal(rows: PickWaveDocumentRow[]) {
  return rows.reduce((sum, row) => sum + rowRoutedQuantity(row), 0);
}

function rowProblemQuantity(row: PickWaveDocumentRow) {
  return Math.max(0, row.requestedQuantity - rowRoutedQuantity(row));
}

function rowStatus(row: PickWaveDocumentRow) {
  if (!row.skuId) {
    return 'SKU не найден';
  }

  const shortage = rowProblemQuantity(row);
  return shortage > 0 ? `Дефицит ${shortage}` : 'Готово';
}

function problemReason(row: PickWaveDocumentRow) {
  if (!row.skuId) {
    return 'У строки нет привязанного SKU.';
  }

  return rowProblemQuantity(row) > 0 ? 'Не хватает доступного или фактически собранного количества.' : '';
}

function sourceLabel(value: WaveAllocation['source']) {
  return value === 'picked' ? 'Факт' : 'План';
}

function locationLabel(allocation: WaveAllocation) {
  const box = allocation.boxCode ?? allocation.boxId ?? 'без короба';
  const pallet = allocation.palletCode ?? allocation.palletId;
  return pallet ? `${box} / ${pallet}` : box;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
