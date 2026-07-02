import { IsString, Matches } from 'class-validator';

export class SetTsdActivationCodeDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Код подтверждения должен состоять ровно из 4 цифр.' })
  code!: string;
}
