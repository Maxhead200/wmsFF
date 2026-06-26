import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTsdDeviceDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsUUID()
  userId!: string;
}
