import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LabelTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateLabelTemplateDto } from './dto/create-label-template.dto';
import { ListLabelTemplatesDto } from './dto/list-label-templates.dto';
import { PreviewLabelTemplateDto } from './dto/preview-label-template.dto';
import { UpdateLabelTemplateDto } from './dto/update-label-template.dto';

type TemplateVariable = string | number | boolean | null;

@Injectable()
export class LabelTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  listTemplates(filter: ListLabelTemplatesDto) {
    return this.prisma.labelTemplate.findMany({
      where: {
        type: filter.type,
      },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createTemplate(dto: CreateLabelTemplateDto) {
    const code = dto.code.trim().toUpperCase();
    const tspl = dto.tspl.trim();
    assertRenderableTspl(tspl);

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.labelTemplate.create({
        data: {
          code,
          name: dto.name.trim(),
          type: dto.type,
          description: dto.description?.trim() || null,
          widthMm: dto.widthMm ?? 80,
          heightMm: dto.heightMm ?? 50,
          tspl,
          version: 1,
          isActive: dto.isActive ?? true,
        },
      });

      await tx.labelTemplateVersion.create({
        data: templateVersionSnapshot(template, 'Создание шаблона'),
      });

      return template;
    });
  }

  async updateTemplate(templateId: string, dto: UpdateLabelTemplateDto) {
    if (!hasTemplatePatch(dto)) {
      throw new BadRequestException('Нет изменений для новой версии шаблона.');
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.labelTemplate.findUnique({
        where: { id: templateId },
      });

      if (!current) {
        throw new NotFoundException('Шаблон этикетки не найден.');
      }

      const existingVersionCount = await tx.labelTemplateVersion.count({
        where: { templateId },
      });

      if (existingVersionCount === 0) {
        await tx.labelTemplateVersion.create({
          data: templateVersionSnapshot(current, 'Базовая версия перед обновлением'),
        });
      }

      const updated = await tx.labelTemplate.update({
        where: { id: templateId },
        data: {
          ...templatePatchData(dto),
          version: { increment: 1 },
        },
      });

      await tx.labelTemplateVersion.create({
        data: templateVersionSnapshot(updated, dto.changeReason),
      });

      return updated;
    });
  }

  async listTemplateVersions(templateId: string) {
    const template = await this.getTemplateOrThrow(templateId);
    const versions = await this.prisma.labelTemplateVersion.findMany({
      where: { templateId },
      orderBy: { version: 'desc' },
    });

    if (versions.length > 0) {
      return versions;
    }

    // Русский комментарий: старые шаблоны могли появиться до таблицы версий, поэтому показываем текущий снимок.
    return [
      {
        id: `${template.id}-v${template.version}`,
        templateId: template.id,
        version: template.version,
        code: template.code,
        name: template.name,
        type: template.type,
        description: template.description,
        widthMm: template.widthMm,
        heightMm: template.heightMm,
        tspl: template.tspl,
        isActive: template.isActive,
        changeReason: 'Текущая версия без отдельного снимка',
        createdAt: template.updatedAt,
      },
    ];
  }

  async previewTemplate(templateId: string, dto: PreviewLabelTemplateDto) {
    const template = await this.getTemplateOrThrow(templateId);

    return {
      printerLanguage: 'TSPL',
      tspl: this.renderTspl(template.tspl, dto.variables ?? {}),
      templateId: template.id,
      templateCode: template.code,
      templateVersion: template.version,
    };
  }

  async getTemplateOrThrow(templateId: string) {
    const template = await this.prisma.labelTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Шаблон этикетки не найден.');
    }

    return template;
  }

  renderTspl(tspl: string, variables: Record<string, TemplateVariable>) {
    assertRenderableTspl(tspl);
    const placeholders = extractPlaceholders(tspl);
    const missingVariables = placeholders.filter((name) => variables[name] == null);

    if (missingVariables.length > 0) {
      throw new BadRequestException(`Не заполнены переменные шаблона: ${missingVariables.join(', ')}`);
    }

    // Русский комментарий: подставляем только значения переменных, сами TSPL-команды остаются в сохраненном шаблоне.
    return tspl.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, name: string) => sanitizeTemplateValue(variables[name]));
  }
}

function hasTemplatePatch(dto: UpdateLabelTemplateDto) {
  return (
    dto.code !== undefined ||
    dto.name !== undefined ||
    dto.type !== undefined ||
    dto.description !== undefined ||
    dto.widthMm !== undefined ||
    dto.heightMm !== undefined ||
    dto.tspl !== undefined ||
    dto.isActive !== undefined
  );
}

function templatePatchData(dto: UpdateLabelTemplateDto) {
  const data: Prisma.LabelTemplateUpdateInput = {};

  if (dto.code !== undefined) {
    data.code = dto.code.trim().toUpperCase();
  }

  if (dto.name !== undefined) {
    data.name = dto.name.trim();
  }

  if (dto.type !== undefined) {
    data.type = dto.type;
  }

  if (dto.description !== undefined) {
    data.description = dto.description.trim() || null;
  }

  if (dto.widthMm !== undefined) {
    data.widthMm = dto.widthMm;
  }

  if (dto.heightMm !== undefined) {
    data.heightMm = dto.heightMm;
  }

  if (dto.tspl !== undefined) {
    const tspl = dto.tspl.trim();
    assertRenderableTspl(tspl);
    data.tspl = tspl;
  }

  if (dto.isActive !== undefined) {
    data.isActive = dto.isActive;
  }

  return data;
}

function templateVersionSnapshot(template: LabelTemplate, reason?: string) {
  return {
    templateId: template.id,
    version: template.version,
    code: template.code,
    name: template.name,
    type: template.type,
    description: template.description,
    widthMm: template.widthMm,
    heightMm: template.heightMm,
    tspl: template.tspl,
    isActive: template.isActive,
    changeReason: reason?.trim() || null,
  } satisfies Prisma.LabelTemplateVersionUncheckedCreateInput;
}

function extractPlaceholders(tspl: string) {
  return Array.from(tspl.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g), (match) => match[1]).filter(
    (name, index, list) => list.indexOf(name) === index,
  );
}

function sanitizeTemplateValue(value: TemplateVariable) {
  return String(value ?? '')
    .replace(/["\r\n\t]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

function assertRenderableTspl(tspl: string) {
  if (!tspl.trim()) {
    throw new BadRequestException('TSPL шаблон не может быть пустым.');
  }

  const rawPlaceholders = tspl.match(/{{[^{}]*}}/g) ?? [];
  const invalidPlaceholders = rawPlaceholders.filter((placeholder) => {
    const name = placeholder.replace(/^{{\s*/, '').replace(/\s*}}$/, '');
    return !/^[A-Za-z0-9_.-]+$/.test(name);
  });
  const templateWithoutValidPlaceholders = tspl.replace(/{{\s*[A-Za-z0-9_.-]+\s*}}/g, '');

  if (
    invalidPlaceholders.length > 0 ||
    templateWithoutValidPlaceholders.includes('{{') ||
    templateWithoutValidPlaceholders.includes('}}')
  ) {
    throw new BadRequestException('Шаблон содержит некорректные переменные. Используйте формат {{variableName}}.');
  }
}
