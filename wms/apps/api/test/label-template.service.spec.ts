import { BadRequestException } from '@nestjs/common';
import { LabelTemplateType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { LabelTemplateService } from '../src/modules/print/label-template.service';

const baseTemplate = {
  id: 'tpl-1',
  code: 'BOX_MAIN',
  name: 'Короб основной',
  type: LabelTemplateType.BOX,
  description: null,
  widthMm: 80,
  heightMm: 50,
  tspl: 'TEXT 10,10,"2",0,1,1,"{{boxCode}}"',
  version: 1,
  isActive: true,
  createdAt: new Date('2026-06-26T10:00:00.000Z'),
  updatedAt: new Date('2026-06-26T10:00:00.000Z'),
};

describe('LabelTemplateService', () => {
  function serviceWithTemplate(tspl: string) {
    const prisma = {
      labelTemplate: {
        findUnique: vi.fn().mockResolvedValue({
          ...baseTemplate,
          tspl,
        }),
      },
    } as unknown as PrismaService;

    return new LabelTemplateService(prisma);
  }

  function serviceWithVersioning() {
    const createdTemplate = {
      ...baseTemplate,
      code: 'BOX_VERSIONED',
      name: 'Box versioned',
    };
    const updatedTemplate = {
      ...createdTemplate,
      name: 'Box versioned v2',
      tspl: 'TEXT 20,20,"2",0,1,1,"{{boxCode}}"',
      version: 2,
    };
    const tx = {
      labelTemplate: {
        create: vi.fn().mockResolvedValue(createdTemplate),
        findUnique: vi.fn().mockResolvedValue(createdTemplate),
        update: vi.fn().mockResolvedValue(updatedTemplate),
      },
      labelTemplateVersion: {
        create: vi.fn().mockResolvedValue({ id: 'version-1' }),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn((callback) => callback(tx)),
    } as unknown as PrismaService;

    return { service: new LabelTemplateService(prisma), prisma, tx, createdTemplate, updatedTemplate };
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
    expect(preview.templateVersion).toBe(1);
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

  it('создает первую версию вместе с новым шаблоном', async () => {
    const { service, tx, createdTemplate } = serviceWithVersioning();

    const template = await service.createTemplate({
      code: 'box_versioned',
      name: 'Box versioned',
      type: LabelTemplateType.BOX,
      tspl: 'TEXT 10,10,"2",0,1,1,"{{boxCode}}"',
    });

    expect(template).toEqual(createdTemplate);
    expect(tx.labelTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'BOX_VERSIONED',
          version: 1,
        }),
      }),
    );
    expect(tx.labelTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: 'tpl-1',
          version: 1,
          changeReason: 'Создание шаблона',
        }),
      }),
    );
  });

  it('обновляет шаблон новой версией и сохраняет снимки истории', async () => {
    const { service, tx, updatedTemplate } = serviceWithVersioning();

    const template = await service.updateTemplate('tpl-1', {
      name: 'Box versioned v2',
      tspl: 'TEXT 20,20,"2",0,1,1,"{{boxCode}}"',
      changeReason: 'Перенос barcode ниже',
    });

    expect(template).toEqual(updatedTemplate);
    expect(tx.labelTemplateVersion.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          changeReason: 'Базовая версия перед обновлением',
        }),
      }),
    );
    expect(tx.labelTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Box versioned v2',
          tspl: 'TEXT 20,20,"2",0,1,1,"{{boxCode}}"',
          version: { increment: 1 },
        }),
      }),
    );
    expect(tx.labelTemplateVersion.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          changeReason: 'Перенос barcode ниже',
        }),
      }),
    );
  });
});
