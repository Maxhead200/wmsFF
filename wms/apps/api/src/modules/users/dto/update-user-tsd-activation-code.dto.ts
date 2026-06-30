import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateUserTsdActivationCodeDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  code?: string;
}
