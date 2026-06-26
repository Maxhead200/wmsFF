import { IsString, Length } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  warehouseId!: string;

  @IsString()
  @Length(1, 40)
  code!: string;

  @IsString()
  @Length(1, 160)
  name!: string;
}
