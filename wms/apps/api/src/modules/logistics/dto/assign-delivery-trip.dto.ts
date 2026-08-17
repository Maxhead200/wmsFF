import { IsOptional, IsString } from 'class-validator';

export class AssignDeliveryTripDto {
  @IsOptional()
  @IsString()
  tripId?: string | null;
}
