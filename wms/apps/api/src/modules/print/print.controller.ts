import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateLabelTemplateDto } from './dto/create-label-template.dto';
import { CreatePrintJobFromTemplateDto } from './dto/create-print-job.dto';
import { ListLabelTemplatesDto } from './dto/list-label-templates.dto';
import { ListPrintJobsDto } from './dto/list-print-jobs.dto';
import { ProcessPrintQueueDto } from './dto/process-print-queue.dto';
import { PreviewLabelTemplateDto } from './dto/preview-label-template.dto';
import { PreviewBoxLabelDto } from './dto/preview-box-label.dto';
import { PreviewPalletLabelDto } from './dto/preview-pallet-label.dto';
import { PreviewSkuLabelDto } from './dto/preview-sku-label.dto';
import { ReprintPrintJobDto } from './dto/reprint-print-job.dto';
import { UpdatePrintJobStatusDto } from './dto/update-print-job-status.dto';
import { UpsertPrintPrinterDto } from './dto/upsert-print-printer.dto';
import { LabelTemplateService } from './label-template.service';
import { PrintJobService } from './print-job.service';
import { PrintPrinterService } from './print-printer.service';
import { PrintQueueWorkerService } from './print-queue-worker.service';
import { TsplLabelService } from './tspl-label.service';

@ApiTags('print')
@RequirePermissions('print:write')
@Controller('print')
export class PrintController {
  constructor(
    private readonly labels: TsplLabelService,
    private readonly templates: LabelTemplateService,
    private readonly jobs: PrintJobService,
    private readonly printers: PrintPrinterService,
    private readonly queue: PrintQueueWorkerService,
  ) {}

  @Get('printers')
  listPrinters() {
    return this.printers.listPrinters();
  }

  @Post('printers')
  upsertPrinter(@Body() body: UpsertPrintPrinterDto) {
    return this.printers.upsertPrinter(body);
  }

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

  @Post('templates/:id/jobs')
  createJobFromTemplate(@Param('id') templateId: string, @Body() body: CreatePrintJobFromTemplateDto) {
    return this.jobs.createFromTemplate(templateId, body);
  }

  @Get('jobs')
  listJobs(@Query() query: ListPrintJobsDto) {
    return this.jobs.listJobs(query);
  }

  @Patch('jobs/:id/status')
  updateJobStatus(@Param('id') jobId: string, @Body() body: UpdatePrintJobStatusDto) {
    return this.jobs.updateStatus(jobId, body);
  }

  @Post('jobs/:id/reprint')
  reprintJob(@Param('id') jobId: string, @Body() body: ReprintPrintJobDto = {}) {
    return this.jobs.reprintJob(jobId, body);
  }

  @Post('jobs/process')
  processQueue(@Body() body: ProcessPrintQueueDto = {}) {
    return this.queue.processQueued(body.limit);
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
