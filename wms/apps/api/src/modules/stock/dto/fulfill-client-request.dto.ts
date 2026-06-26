import { IsOptional, IsString } from 'class-validator';

export class FulfillClientRequestDto {
  @IsString()
  requestId!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
