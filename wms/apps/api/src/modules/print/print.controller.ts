import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateLabelTemplateDto } from './dto/create-label-template.dto';
import { ListLabelTemplatesDto } from './dto/list-label-templates.dto';
import { PreviewLabelTemplateDto } from './dto/preview-label-template.dto';
import { PreviewBoxLabelDto } from './dto/preview-box-label.dto';
import { PreviewPalletLabelDto } from './dto/preview-pallet-label.dto';
import { PreviewSkuLabelDto } from './dto/preview-sku-label.dto';
import { LabelTemplateService } from './label-template.service';
import { TsplLabelService } from './tspl-label.service';

@ApiTags('print')
@RequirePermissions('print:write')
@Controller('print')
export class PrintController {
  constructor(
    private readonly labels: TsplLabelService,
    private readonly templates: LabelTemplateService,
  ) {}

  @Get('templates')
  listTemplates(@Query() query: ListLabelTemplatesDto) {
    return this.templates.listTemplates(query);
  }

  @Post('templates')
  createTemplate(@Body() body: CreateLabelTemplateDto) {
    return this.templates.createTemplate(body);
  }

  @Post('templates/:id/preview')
  previewTemplate(@Param('id') templateId: string, @Body() body: PreviewLabelTemplateDto) {
    return this.templates.previewTemplate(templateId, body);
  }

  @Post('box-label/preview')
  previewBoxLabel(@Body() body: PreviewBoxLabelDto) {
    return {
      printerLanguage: 'TSPL',
      tspl: this.labels.boxLabel(body),
    };
  }

  @Post('sku-label/preview')
  previewSkuLabel(@Body() body: PreviewSkuLabelDto) {
    return {
      printerLanguage: 'TSPL',
      tspl: this.labels.skuLabel(body),
    };
  }

  @Post('pallet-label/preview')
  previewPalletLabel(@Body() body: PreviewPalletLabelDto) {
    return {
      printerLanguage: 'TSPL',
      tspl: this.labels.palletLabel(body),
    };
  }
}
