import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

export const PRINT_PRINTER_CONNECTION_TYPES = ['dry_run', 'tcp'] as const;
export type PrintPrinterConnectionType = (typeof PRINT_PRINTER_CONNECTION_TYPES)[number];

export class UpsertPrintPrinterDto {
  @IsString()
  @Length(2, 80)
  code!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  groupCode?: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsIn(PRINT_PRINTER_CONNECTION_TYPES)
  connectionType?: PrintPrinterConnectionType;

  @ValidateIf((dto: UpsertPrintPrinterDto) => dto.connectionType === 'tcp')
  @IsString()
  @Length(2, 200)
  host?: string;

  @ValidateIf((dto: UpsertPrintPrinterDto) => dto.connectionType === 'tcp')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  autoProcess?: boolean;
}
