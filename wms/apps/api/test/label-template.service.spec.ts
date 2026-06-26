import { BadRequestException } from '@nestjs/common';
import { LabelTemplateType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { LabelTemplateService } from '../src/modules/print/label-template.service';

describe('LabelTemplateService', () => {
  function serviceWithTemplate(tspl: string) {
    const prisma = {
      labelTemplate: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'tpl-1',
          code: 'BOX_MAIN',
          name: 'Короб основной',
          type: LabelTemplateType.BOX,
          description: null,
          widthMm: 80,
          heightMm: 50,
          tspl,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    } as unknown as PrismaService;

    return new LabelTemplateService(prisma);
  }

  it('подставляет переменные в TSPL шаблон', async () => {
    const service = serviceWithTemplate('TEXT 40,35,"3",0,1,1,"{{clientName}}"\nBARCODE 40,95,"128",90,1,0,2,2,"{{boxCode}}"');

    const preview = await service.previewTemplate('tpl-1', {
      variables: {
        clientName: 'LOGOFF',
        boxCode: 'BOX-001',
      },
    });

    expect(preview.tspl).toContain('"LOGOFF"');
    expect(preview.tspl).toContain('"BOX-001"');
    expect(preview.tspl).not.toContain('{{boxCode}}');
  });

  it('очищает значения переменных от кавычек и переносов', () => {
    const service = serviceWithTemplate('TEXT 10,10,"2",0,1,1,"{{name}}"');

    const tspl = service.renderTspl('TEXT 10,10,"2",0,1,1,"{{name}}"', {
      name: 'Client "A"\nLine',
    });

    expect(tspl).toContain('"Client  A  Line"');
  });

  it('не печатает шаблон с незаполненными переменными', () => {
    const service = serviceWithTemplate('TEXT 10,10,"2",0,1,1,"{{clientName}}"');

    expect(() => service.renderTspl('TEXT 10,10,"2",0,1,1,"{{clientName}}"', {})).toThrow(BadRequestException);
  });

  it('отклоняет шаблон с некорректными фигурными скобками', () => {
    const service = serviceWithTemplate('TEXT 10,10,"2",0,1,1,"{{clientName}}"');

    expect(() => service.renderTspl('TEXT 10,10,"2",0,1,1,"{{clientName}}" {{broken', { clientName: 'LOGOFF' })).toThrow(
      BadRequestException,
    );
  });
});
