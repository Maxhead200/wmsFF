import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { FboTwoStageService } from '../src/modules/tsd/fbo-two-stage.service';
// TEST: serialization retries belong to the owner of the database transaction.
describe('FBO transaction retry ownership', () => {
  for (const recovery of [true, false]) {
    it(recovery ? 'propagates an external transaction conflict unchanged' : 'retries ordinary actions in fresh transactions', async () => {
      process.env.WMS_FBO_TWO_STAGE_ENABLED = 'true';
      let calls = 0;
      const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {code: 'P2034', clientVersion: 'test'});
      const db = {$transaction: async () => {calls++; throw conflict;}};
      const service = new FboTwoStageService(db as any, {} as any, {} as any, {} as any,
        {assertStockMovementsAllowed: async () => {}} as any, {} as any);
      (service as any).recoveryTransaction = recovery;
      await expect(service.act('r', {action: 'START', operationId: 'same'} as any, {id: 'admin'} as any)).rejects.toBe(conflict);
      expect(calls).toBe(recovery ? 1 : 3);
    });
  }
});
