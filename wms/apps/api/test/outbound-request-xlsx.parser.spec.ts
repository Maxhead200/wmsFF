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
