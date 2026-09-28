import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// FIX: initial rates are validated and committed with the new employee.
export class PayrollInitialConditionDto {
  @IsIn(['HOURLY', 'PIECE', 'PALLET']) kind!: string;
  @IsInt() @Min(0) rateKopecks!: number;
  @IsISO8601() startsAt!: string;
}

export class PayrollEmployeeDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsString() userId?: string;
  @IsBoolean() picker!: boolean;
  @IsBoolean() loader!: boolean;
  @IsBoolean() isActive!: boolean;
  // FIX: incomplete historical requisites must not imply a cash payment agreement.
  @IsIn(['CASH', 'TRANSFER', 'UNSPECIFIED']) paymentMethod!: string;
  @IsOptional() @IsString() @MaxLength(32) paymentPhone?: string;
  @IsOptional() @IsString() @MaxLength(200) paymentBank?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(2) @ValidateNested({ each: true }) @Type(() => PayrollInitialConditionDto)
  initialConditions?: PayrollInitialConditionDto[];
}

export class PayrollConditionDto {
  @IsIn(['HOURLY', 'PIECE', 'PALLET']) kind!: string;
  @IsInt() @Min(0) rateKopecks!: number;
  @IsISO8601() startsAt!: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsBoolean() temporary!: boolean;
  @IsString() @MaxLength(1000) reason!: string;
}

export class PayrollShiftDto {
  @IsISO8601() startsAt!: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsString() @MaxLength(1000) reason!: string;
  // FIX: one override per day; omitted preserves it, null restores automatic lunch.
  @IsOptional() @IsInt() @Min(0) lunchMinutes?: number | null;
}

export class PayrollHistoryEditDto {
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsInt() @Min(0) lunchMinutes!: number;
  @IsInt() @Min(0) rateKopecks!: number;
  @IsString() @MaxLength(1000) reason!: string;
}

export class PayrollHandlingDto {
  @IsString() warehouseId!: string;
  @IsISO8601() startsAt!: string;
  @IsIn(['LOAD', 'UNLOAD']) operation!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) palletCount!: number;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsString({ each: true }) employeeIds!: string[];
  @IsString() @MaxLength(1000) reason!: string;
}

// FIX: an explicit operation tariff is separate from the employee's permanent conditions.
export class PayrollHandlingConfirmDto {
  @IsOptional() @IsInt() @Min(0) rateKopecks?: number;
}
export class PayrollHandlingCancelDto {
  @IsString() @MaxLength(1000) reason!: string;
}

export class PayrollStatusDto {
  @IsString() employeeId!: string;
  @IsString() dateFrom!: string;
  @IsString() dateTo!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsString({ each: true }) keys!: string[];
  @IsIn(['UNPAID', 'REVIEW', 'PAID']) status!: string;
  @IsString() @MaxLength(1000) comment!: string;
}
