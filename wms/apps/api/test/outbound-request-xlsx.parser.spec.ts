import { describe, expect, it } from 'vitest';
import { parseOutboundRequestXlsxRows } from '../src/modules/client-requests/parsers/outbound-request-xlsx.parser';

describe('parseOutboundRequestXlsxRows', () => {
  it('читает файл с русскими заголовками и агрегирует повторные баркоды', () => {
    const parsed = parseOutboundRequestXlsxRows([
      ['Баркод товара', 'Количество'],
      ['460000000001', 2],
      ['460000000002', '3'],
      ['460000000001', 4],
    ]);

    expect(parsed.issues).toEqual([]);
    expect(parsed.lines).toEqual([
      { barcode: '460000000001', quantity: 6, sourceRows: [2, 4] },
      { barcode: '460000000002', quantity: 3, sourceRows: [3] },
    ]);
    expect(parsed.summary.totalQuantity).toBe(9);
  });

  it('поддерживает файл без заголовка в первых двух колонках', () => {
    const parsed = parseOutboundRequestXlsxRows([
      ['460000000001', '2'],
      ['460000000002', '1'],
    ]);

    expect(parsed.lines.map((line) => line.barcode)).toEqual(['460000000001', '460000000002']);
    expect(parsed.summary.lines).toBe(2);
  });

  it('читает матрицу листа "Должно уехать" с городами', () => {
    const parsed = parseOutboundRequestXlsxRows([
      ['Артикул продавца', 'Баркод', 'Размер', 'Невинномысск', 'Электросталь'],
      ['Костюм_велюр_розовый', 2042311801134, 'XS', 3, 10],
      ['Костюм_реглан_синий', 2047945569191, 'L', '', 2],
    ]);

    expect(parsed.issues).toEqual([]);
    expect(parsed.lines).toEqual([
      {
        barcode: '2042311801134',
        quantity: 3,
        city: 'Невинномысск',
        artSeller: 'Костюм_велюр_розовый',
        size: 'XS',
        sourceRows: [2],
      },
      {
        barcode: '2042311801134',
        quantity: 10,
        city: 'Электросталь',
        artSeller: 'Костюм_велюр_розовый',
        size: 'XS',
        sourceRows: [2],
      },
      {
        barcode: '2047945569191',
        quantity: 2,
        city: 'Электросталь',
        artSeller: 'Костюм_реглан_синий',
        size: 'L',
        sourceRows: [3],
      },
    ]);
    expect(parsed.summary.totalQuantity).toBe(15);
  });

  it('возвращает ошибки по пустому баркоду и некорректному количеству', () => {
    const parsed = parseOutboundRequestXlsxRows([
      ['barcode', 'qty'],
      ['', 2],
      ['460000000001', 0],
    ]);

    expect(parsed.issues).toEqual([
      { row: 2, message: 'Не заполнен баркод товара.', severity: 'error' },
      {
        row: 3,
        barcode: '460000000001',
        message: 'Количество должно быть целым числом больше нуля.',
        severity: 'error',
      },
    ]);
  });
});
