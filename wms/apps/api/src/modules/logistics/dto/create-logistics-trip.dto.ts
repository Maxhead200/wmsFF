import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateLogisticsTripDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  carrierId?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
