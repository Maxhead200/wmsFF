import { IsOptional, IsString, Length } from 'class-validator';

export class UpsertPalletDto {
  @IsString()
  clientId!: string;

  @IsString()
  @Length(1, 80)
  code!: string;

  @IsOptional()
  @IsString()
  zoneId?: string;
}
