import { Module } from '@nestjs/common';
import { LabelTemplateService } from './label-template.service';
import { PrintJobService } from './print-job.service';
import { PrintController } from './print.controller';
import { TsplLabelService } from './tspl-label.service';

@Module({
  controllers: [PrintController],
  providers: [LabelTemplateService, PrintJobService, TsplLabelService],
  exports: [LabelTemplateService, PrintJobService, TsplLabelService],
})
export class PrintModule {}
