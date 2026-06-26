import { describe, expect, it } from 'vitest';
import { parseStockSheet } from '../src/modules/imports/parsers/stock-xlsx.parser';

describe('parseStockSheet', () => {
  it('парсит короб, товары и количество из формата остатков', () => {
    const result = parseStockSheet(
      [
        ['Короб', null, null, 'Штрих код', 'logo_Наименование', null, 'Цвет', 'Размер', 'Количество Остаток'],
        ['FFL_BOX_001'],
        ['FFL_BOX_001', null, null, '2044970204592', 'Костюм_пример', null, 'серый', 'XL', '2'],
        ['FFL_BOX_001', null, null, '2044970204615', 'Костюм_пример', null, 'серый', 'XXL', 3],
      ],
      { clientId: 'client-1' },
    );

    expect(result.summary).toEqual({ rows: 2, boxes: 1, barcodes: 2, totalQuantity: 5 });
    expect(result.issues).toEqual([]);
  });
});
