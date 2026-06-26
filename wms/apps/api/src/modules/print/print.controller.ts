import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PreviewBoxLabelDto } from './dto/preview-box-label.dto';
import { PreviewPalletLabelDto } from './dto/preview-pallet-label.dto';
import { PreviewSkuLabelDto } from './dto/preview-sku-label.dto';
import { TsplLabelService } from './tspl-label.service';

@ApiTags('print')
@RequirePermissions('print:write')
@Controller('print')
export class PrintController {
  constructor(private readonly labels: TsplLabelService) {}

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
