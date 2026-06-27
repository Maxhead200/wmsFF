import { PartialType } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

export class UpdateClientDto extends PartialType(CreateClientDto) {
  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsString()
  @Length(2, 200)
  legalName?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsString()
  @Length(10, 12)
  inn?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsEmail()
  email?: string;
}
