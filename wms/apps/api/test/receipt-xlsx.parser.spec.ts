import { describe, expect, it } from 'vitest';
import { parseReceiptSheet } from '../src/modules/imports/parsers/receipt-xlsx.parser';

describe('parseReceiptSheet', () => {
  it('читает короб отдельной строкой и товары с КИЗ', () => {
    const parsed = parseReceiptSheet(
      [
        ['Баркод', 'Короб на складе', 'Киз', 'Артикул', 'Цвет', 'Размер'],
        ['FFL_F_LKB2406_1', '', '', '#N/A', '#N/A', '#N/A'],
        ['2049135244185', '', 'KIZ-1', 'Костюм', 'сливочный', 'S'],
        ['2049135244185', '', 'KIZ-2', 'Костюм', 'сливочный', 'S'],
      ],
      { clientId: 'client-1' },
    );

    expect(parsed.summary).toEqual({
      rows: 2,
      boxes: 1,
      barcodes: 1,
      kiz: 2,
      totalQuantity: 2,
    });
    expect(parsed.items[0]).toEqual(
      expect.objectContaining({
        clientId: 'client-1',
        boxCode: 'FFL_F_LKB2406_1',
        barcode: '2049135244185',
        kiz: 'KIZ-1',
        name: 'Костюм',
        color: 'сливочный',
        size: 'S',
        quantity: 1,
      }),
    );
  });

  it('показывает ошибку при дубле КИЗ в файле', () => {
    const parsed = parseReceiptSheet(
      [
        ['Баркод', 'Короб на складе', 'Киз', 'Артикул', 'Цвет', 'Размер'],
        ['FFL_F_LKB2406_1', '', '', '#N/A', '#N/A', '#N/A'],
        ['2049135244185', '', 'KIZ-1', 'Костюм', 'сливочный', 'S'],
        ['2049135244185', '', 'KIZ-1', 'Костюм', 'сливочный', 'S'],
      ],
      { clientId: 'client-1' },
    );

    expect(parsed.issues).toContainEqual(
      expect.objectContaining({
        row: 4,
        severity: 'error',
      }),
    );
  });
});
