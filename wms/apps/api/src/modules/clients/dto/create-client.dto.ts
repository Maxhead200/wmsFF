import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @Length(2, 40)
  code!: string;

  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsString()
  inn?: string;

  @IsOptional()
  @IsString()
  kpp?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
