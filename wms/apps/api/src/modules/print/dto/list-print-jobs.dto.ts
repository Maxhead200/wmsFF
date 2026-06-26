import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PRINT_JOB_STATUSES, type PrintJobStatus } from '../print-job-status';

export class ListPrintJobsDto {
  @IsOptional()
  @IsIn(PRINT_JOB_STATUSES)
  status?: PrintJobStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
