import { Module } from '@nestjs/common';
import { LabelTemplateService } from './label-template.service';
import { PrintController } from './print.controller';
import { TsplLabelService } from './tspl-label.service';

@Module({
  controllers: [PrintController],
  providers: [LabelTemplateService, TsplLabelService],
  exports: [LabelTemplateService, TsplLabelService],
})
export class PrintModule {}
