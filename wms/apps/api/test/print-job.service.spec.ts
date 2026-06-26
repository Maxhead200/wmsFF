import { BadRequestException } from '@nestjs/common';
import { LabelTemplateType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { LabelTemplateService } from '../src/modules/print/label-template.service';
import { PrintJobService } from '../src/modules/print/print-job.service';

describe('PrintJobService', () => {
  function createService(options: { isActive?: boolean } = {}) {
    const prisma = {
      printJob: {
        create: vi.fn().mockImplementation(({ data }) => ({ id: 'job-1', createdAt: new Date(), ...data })),
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-1',
          payload: { source: 'label-template' },
        }),
        update: vi.fn().mockImplementation(({ data }) => ({ id: 'job-1', createdAt: new Date(), ...data })),
      },
    } as unknown as PrismaService;

    const templates = {
      getTemplateOrThrow: vi.fn().mockResolvedValue({
        id: 'tpl-1',
        code: 'BOX_STANDARD',
        name: 'Box standard',
        type: LabelTemplateType.BOX,
        tspl: 'TEXT 10,10,"2",0,1,1,"{{boxCode}}"',
        isActive: options.isActive ?? true,
      }),
      renderTspl: vi.fn().mockReturnValue('TEXT 10,10,"2",0,1,1,"BOX-001"'),
    } as unknown as LabelTemplateService;

    return { service: new PrintJobService(prisma, templates), prisma, templates };
  }

  it('ставит готовый TSPL из шаблона в очередь печати', async () => {
    const { service, templates } = createService();

    const job = await service.createFromTemplate('tpl-1', {
      printerCode: 'TSC-01',
      variables: { boxCode: 'BOX-001' },
      copies: 2,
    });

    expect(job.printerCode).toBe('TSC-01');
    expect(job.labelType).toBe(LabelTemplateType.BOX);
    expect(job.status).toBe('queued');
    expect(job.tspl).toContain('BOX-001');
    expect(templates.renderTspl).toHaveBeenCalledWith('TEXT 10,10,"2",0,1,1,"{{boxCode}}"', { boxCode: 'BOX-001' });
  });

  it('не ставит в очередь отключенный шаблон', async () => {
    const { service } = createService({ isActive: false });

    await expect(
      service.createFromTemplate('tpl-1', {
        printerCode: 'TSC-01',
        variables: { boxCode: 'BOX-001' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('обновляет статус задания и сохраняет сообщение оператора', async () => {
    const { service } = createService();

    const job = await service.updateStatus('job-1', {
      status: 'failed',
      message: 'Нет бумаги',
    });

    expect(job.status).toBe('failed');
    expect(job.payload).toMatchObject({
      source: 'label-template',
      statusMessage: 'Нет бумаги',
    });
  });
});
