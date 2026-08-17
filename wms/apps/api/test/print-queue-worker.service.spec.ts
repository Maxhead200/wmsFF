import { describe, expect, it, vi } from 'vitest';
import { PrintQueueWorkerService } from '../src/modules/print/print-queue-worker.service';

describe('PrintQueueWorkerService', () => {
  it('обрабатывает queued job на dry-run принтере как printed', async () => {
    const prisma = {
      printPrinter: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'printer-1',
            code: 'TSC-01',
            name: 'TSC dry-run',
            connectionType: 'dry_run',
            host: null,
            port: null,
            isActive: true,
            autoProcess: true,
            lastSeenAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        update: vi.fn().mockResolvedValue({ id: 'printer-1' }),
      },
      printJob: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'job-1',
            printerCode: 'TSC-01',
            labelType: 'BOX',
            payload: { source: 'label-template' },
            tspl: 'PRINT 1',
            status: 'queued',
            attempts: 0,
            processedAt: null,
            createdAt: new Date(),
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ id: 'job-1' }),
      },
    };
    const service = new PrintQueueWorkerService(prisma as never, { get: vi.fn() } as never, {} as never);

    const result = await service.processQueued(10);

    expect(result).toEqual({ processed: 1, printed: 1, sent: 0, failed: 0, skipped: 0 });
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1', status: 'queued' },
        data: expect.objectContaining({
          status: 'sent',
          attempts: { increment: 1 },
        }),
      }),
    );
    expect(prisma.printJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'printed',
          processedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('ничего не делает без активных autoProcess принтеров', async () => {
    const prisma = {
      printPrinter: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      printJob: {
        findMany: vi.fn(),
      },
    };
    const service = new PrintQueueWorkerService(prisma as never, { get: vi.fn() } as never, {} as never);

    await expect(service.processQueued()).resolves.toEqual({ processed: 0, printed: 0, sent: 0, failed: 0, skipped: 0 });
    expect(prisma.printJob.findMany).not.toHaveBeenCalled();
  });

  it('пропускает job, который уже забрал другой обработчик', async () => {
    const prisma = {
      printPrinter: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'printer-1',
            code: 'TSC-01',
            name: 'TSC dry-run',
            connectionType: 'dry_run',
            host: null,
            port: null,
            isActive: true,
            autoProcess: true,
            lastSeenAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
      printJob: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'job-1',
            printerCode: 'TSC-01',
            labelType: 'BOX',
            payload: {},
            tspl: 'PRINT 1',
            status: 'queued',
            attempts: 0,
            processedAt: null,
            createdAt: new Date(),
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
      },
    };
    const service = new PrintQueueWorkerService(prisma as never, { get: vi.fn() } as never, {} as never);

    await expect(service.processQueued()).resolves.toEqual({ processed: 0, printed: 0, sent: 0, failed: 0, skipped: 1 });
    expect(prisma.printJob.update).not.toHaveBeenCalled();
  });
});
