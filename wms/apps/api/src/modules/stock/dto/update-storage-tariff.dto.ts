import { IsNumber, Min } from 'class-validator';

export class UpdateStorageTariffDto {
  @IsNumber()
  @Min(0)
  storagePriceRubPerLiterDay!: number;
}
