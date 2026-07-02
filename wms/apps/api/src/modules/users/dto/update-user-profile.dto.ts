import { UserStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class UpdateUserProfileDto {
  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsEmail()
  email?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsString()
  @Length(4, 200)
  password?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
