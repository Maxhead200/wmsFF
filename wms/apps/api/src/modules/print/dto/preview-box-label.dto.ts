import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PreviewBoxLabelDto {
  @IsString()
  boxCode!: string;

  @IsString()
  clientName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;
}
