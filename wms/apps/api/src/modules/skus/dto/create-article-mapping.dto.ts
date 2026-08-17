import { IsOptional, IsString, Length } from 'class-validator';

export class CreateArticleMappingDto {
  @IsString()
  clientId!: string;

  @IsString()
  @Length(1, 200)
  sourceArticle!: string;

  @IsString()
  @Length(1, 200)
  targetArticle!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
