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

  it('считает одиночную строку короба заголовком и читает количество из колонки файла 1С', () => {
    const result = parseStockSheet(
      [
        ['Короб', null, null, 'Штрих код', 'logo_Наименование', 'Цвет', 'Размер', 'Количество Остаток'],
        ['FFL_BAL2206_001'],
        ['FFL_BAL2206_001', null, null, '2047945569191', 'Костюм_реглан_синий', 'синий', 'L', '8'],
        ['FFL_BAL2206_001', null, null, '2047945628454', 'Костюм_ностальджи_синебордовый', 'синий;бордовый', 'S', '1'],
        ['FFL_LKB0506_043', null, null, null, null, '#N/A', '#N/A', '1'],
        ['FFL_BAL2206_001', null, null, '2047945975671', 'Костюм_олмост_красный', 'красный', 'L', '1'],
      ],
      { clientId: 'client-1' },
    );

    expect(result.summary).toEqual({ rows: 3, boxes: 1, barcodes: 3, totalQuantity: 10 });
    expect(result.issues).toEqual([]);
    expect(result.items[0]).toMatchObject({
      boxCode: 'FFL_BAL2206_001',
      barcode: '2047945569191',
      color: 'синий',
      size: 'L',
      quantity: 8,
    });
  });
});
