import { describe, expect, it } from 'vitest';
import { TsplLabelService } from '../src/modules/print/tspl-label.service';

describe('TsplLabelService', () => {
  const service = new TsplLabelService();

  it('создает коробную этикетку с barcode короба', () => {
    const tspl = service.boxLabel({
      boxCode: 'BOX-1',
      clientName: 'Client "A"',
      quantity: 3,
    });

    expect(tspl).toContain('SIZE 80 mm,50 mm');
    expect(tspl).toContain('"BOX-1"');
    expect(tspl).toContain('Кол-во строк: 3');
    expect(tspl).not.toContain('Client "A"');
  });

  it('создает SKU-этикетку с основным штрихкодом товара', () => {
    const tspl = service.skuLabel({
      skuCode: 'SKU-1',
      name: 'Товар тестовый',
      barcode: '460000000001',
      clientName: 'Client',
      article: 'ART-1',
      color: 'Красный',
      size: 'M',
    });

    expect(tspl).toContain('SIZE 60 mm,40 mm');
    expect(tspl).toContain('SKU: SKU-1');
    expect(tspl).toContain('Арт: ART-1');
    expect(tspl).toContain('"460000000001"');
  });

  it('создает паллетную этикетку с зоной и количеством коробов', () => {
    const tspl = service.palletLabel({
      palletCode: 'PAL-1',
      clientName: 'Client',
      zoneCode: 'A-01',
      boxesCount: 12,
    });

    expect(tspl).toContain('SIZE 100 mm,70 mm');
    expect(tspl).toContain('Паллета: PAL-1');
    expect(tspl).toContain('Зона: A-01');
    expect(tspl).toContain('Коробов: 12');
  });
});
