import { IsString, Length } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @Length(2, 40)
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;
}
