import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LabelTemplateService } from './label-template.service';
import { PrintJobService } from './print-job.service';
import { PrintPrinterService } from './print-printer.service';
import { PrintQueueWorkerService } from './print-queue-worker.service';
import { PrintController } from './print.controller';
import { TsplLabelService } from './tspl-label.service';

@Module({
  imports: [ConfigModule],
  controllers: [PrintController],
  providers: [LabelTemplateService, PrintJobService, PrintPrinterService, PrintQueueWorkerService, TsplLabelService],
  exports: [LabelTemplateService, PrintJobService, PrintPrinterService, PrintQueueWorkerService, TsplLabelService],
})
export class PrintModule {}
