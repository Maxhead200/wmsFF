import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class ScanOperationDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  operationKey!: string;

  @IsIn(['receipt_scan', 'move_scan', 'inventory_scan'])
  operationType!: 'receipt_scan' | 'move_scan' | 'inventory_scan';

  @IsObject()
  payload!: Record<string, unknown>;
}
