import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrintPrinterService } from '../src/modules/print/print-printer.service';

describe('PrintPrinterService', () => {
  it('upsert-ит dry-run принтер с нормализованным кодом', async () => {
    const prisma = {
      printPrinter: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(({ create }) => ({ id: 'printer-1', ...create })),
      },
    };
    const service = new PrintPrinterService(prisma as never, { get: vi.fn() } as never, {} as never);

    const printer = await service.upsertPrinter({
      code: ' tsc-01 ',
      name: 'TSC склад',
      connectionType: 'dry_run',
    });

    expect(printer.code).toBe('TSC-01');
    expect(prisma.printPrinter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'TSC-01' },
        create: expect.objectContaining({
          connectionType: 'dry_run',
          host: null,
          port: null,
        }),
      }),
    );
  });

  it('требует host и port для tcp-принтера', async () => {
    const service = new PrintPrinterService(
      { printPrinter: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() } } as never,
      { get: vi.fn() } as never,
      {} as never,
    );

    await expect(
      service.upsertPrinter({
        code: 'TCP-01',
        name: 'TCP printer',
        connectionType: 'tcp',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
