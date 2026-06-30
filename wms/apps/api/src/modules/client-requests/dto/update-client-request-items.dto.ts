import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { CreateClientRequestItemDto } from './create-client-request.dto';

export class UpdateClientRequestItemsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CreateClientRequestItemDto)
  items?: CreateClientRequestItemDto[];
}
