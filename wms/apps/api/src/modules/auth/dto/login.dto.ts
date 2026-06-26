import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(1, 200)
  email!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}
