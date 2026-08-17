import { IsIn, IsOptional, IsString } from 'class-validator';
import { PRINT_JOB_STATUSES, type PrintJobStatus } from '../print-job-status';

export class UpdatePrintJobStatusDto {
  @IsIn(PRINT_JOB_STATUSES)
  status!: PrintJobStatus;

  @IsOptional()
  @IsString()
  message?: string;
}
