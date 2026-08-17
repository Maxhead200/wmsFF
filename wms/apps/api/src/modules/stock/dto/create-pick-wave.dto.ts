import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class CreatePickWaveDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  requestIds!: string[];

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  assignedPickerUserId?: string;
}
