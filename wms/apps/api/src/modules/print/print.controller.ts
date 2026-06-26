import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TsplLabelService } from './tspl-label.service';

@ApiTags('print')
@Controller('print')
export class PrintController {
  constructor(private readonly labels: TsplLabelService) {}

  @Post('box-label/preview')
  previewBoxLabel(@Body() body: { boxCode: string; clientName: string; quantity?: number }) {
    return {
      printerLanguage: 'TSPL',
      tspl: this.labels.boxLabel(body),
    };
  }
}
