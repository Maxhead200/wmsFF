import { IsString, MinLength } from 'class-validator';

export class LoginTsdDeviceDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(8)
  secret!: string;
}
