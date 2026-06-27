import { describe, expect, it } from 'vitest';
import { parseNomenclatureSheet } from '../src/modules/skus/nomenclature-xlsx.parser';

describe('parseNomenclatureSheet', () => {
  it('читает номенклатуру из формата 1С', () => {
    const result = parseNomenclatureSheet(
      [
        ['Наименование', 'Артикул ', 'Единица хранения', 'Наименование для печати', 'Тип номенклатуры'],
        ['Asus n6506m', '', 'шт', 'Asus n6506m', 'Услуга'],
        ['Honor MagicBook Pro 14', 'HMP-14', 'шт', 'Honor MagicBook Pro 14', 'Товар'],
      ],
      { clientId: 'client-1' },
    );

    expect(result.summary).toEqual({ sourceRows: 2, rows: 2, barcodes: 0 });
    expect(result.issues).toEqual([]);
    expect(result.items[0]).toMatchObject({
      clientId: 'client-1',
      internalSku: 'Asus n6506m',
      name: 'Asus n6506m',
      sourceRow: 2,
    });
    expect(result.items[1]).toMatchObject({
      internalSku: 'HMP-14',
      article: 'HMP-14',
      name: 'Honor MagicBook Pro 14',
    });
  });

  it('пропускает дубли внутри файла', () => {
    const result = parseNomenclatureSheet(
      [
        ['Наименование', 'Артикул'],
        ['Товар 1', 'SKU-1'],
        ['Товар 1 копия', 'SKU-1'],
      ],
      { clientId: 'client-1' },
    );

    expect(result.items).toHaveLength(1);
    expect(result.issues).toEqual([
      expect.objectContaining({
        row: 3,
        internalSku: 'SKU-1',
        severity: 'warning',
      }),
    ]);
  });
});
