import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateLabelTemplateDto } from './dto/create-label-template.dto';
import { ListLabelTemplatesDto } from './dto/list-label-templates.dto';
import { PreviewLabelTemplateDto } from './dto/preview-label-template.dto';

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
    this.assertTemplateIsRenderable(tspl);

    return this.prisma.labelTemplate.create({
      data: {
        code,
        name: dto.name.trim(),
        type: dto.type,
        description: dto.description?.trim() || null,
        widthMm: dto.widthMm ?? 80,
        heightMm: dto.heightMm ?? 50,
        tspl,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async previewTemplate(templateId: string, dto: PreviewLabelTemplateDto) {
    const template = await this.prisma.labelTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Шаблон этикетки не найден.');
    }

    return {
      printerLanguage: 'TSPL',
      tspl: this.renderTspl(template.tspl, dto.variables ?? {}),
      templateId: template.id,
      templateCode: template.code,
    };
  }

  renderTspl(tspl: string, variables: Record<string, TemplateVariable>) {
    this.assertTemplateIsRenderable(tspl);
    const placeholders = extractPlaceholders(tspl);
    const missingVariables = placeholders.filter((name) => variables[name] == null);

    if (missingVariables.length > 0) {
      throw new BadRequestException(`Не заполнены переменные шаблона: ${missingVariables.join(', ')}`);
    }

    // Русский комментарий: подставляем только значения переменных, сами TSPL-команды остаются в сохраненном шаблоне.
    return tspl.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, name: string) => sanitizeTemplateValue(variables[name]));
  }

  private assertTemplateIsRenderable(tspl: string) {
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
