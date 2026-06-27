import { PartialType } from '@nestjs/swagger';
import { UpsertMarketplaceConnectionDto } from './upsert-marketplace-connection.dto';

export class UpdateMarketplaceConnectionDto extends PartialType(UpsertMarketplaceConnectionDto) {}
