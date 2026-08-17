import { describe, expect, it } from 'vitest';
import { VolumeService } from '../src/modules/stock/volume.service';

describe('VolumeService', () => {
  const service = new VolumeService();

  it('рассчитывает литраж из сантиметров', () => {
    expect(service.calculateLiters({ lengthCm: 20, widthCm: 10, heightCm: 5 }).liters).toBe(1);
  });

  it('округляет вверх по настройке тарифа', () => {
    expect(service.calculateLiters({ lengthCm: 11, widthCm: 11, heightCm: 11, precision: 0.1, mode: 'ceil' }).liters).toBe(1.4);
  });

  it('считает общий объём остатка', () => {
    expect(service.totalLiters(1.25, 8)).toBe(10);
  });
});
