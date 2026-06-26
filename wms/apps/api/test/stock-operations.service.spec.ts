import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { StockOperationsService } from '../src/modules/stock/stock-operations.service';

describe('StockOperationsService', () => {
  const service = new StockOperationsService({} as never, {} as never);

  it('планирует перенос между коробами без потери количества', () => {
    expect(service.planTransferQuantities(10, 3, 4)).toEqual({
      sourceQuantity: 6,
      targetQuantity: 7,
    });
  });

  it('не разрешает переносить больше доступного остатка', () => {
    expect(() => service.planTransferQuantities(2, 0, 3)).toThrow(BadRequestException);
  });
});
