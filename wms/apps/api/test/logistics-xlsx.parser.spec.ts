import { describe, expect, it } from 'vitest';
import { parseLogisticsTariffSheet } from '../src/modules/imports/parsers/logistics-xlsx.parser';

describe('parseLogisticsTariffSheet', () => {
  it('группирует направления и диапазоны паллет', () => {
    const result = parseLogisticsTariffSheet([
      ['Стоимость логистики может отличаться в сезон'],
      ['МОСКВА'],
      ['Электросталь (цена за паллет)', ''],
      ['от 1 до 10 шт (до 1 мЗ)', '5000'],
      ['2-3 палеты', '4500'],
    ]);

    expect(result.directions).toHaveLength(1);
    expect(result.directions[0].destination).toBe('Электросталь');
    expect(result.directions[0].tiers[0]).toMatchObject({ maxBoxes: 10, priceRub: 5000 });
    expect(result.directions[0].tiers[1]).toMatchObject({ minPallets: 2, maxPallets: 3, priceRub: 4500 });
  });
});
