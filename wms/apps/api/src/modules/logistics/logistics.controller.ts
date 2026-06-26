import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { QuoteLogisticsDto } from './dto/quote-logistics.dto';
import { LogisticsService } from './logistics.service';

@ApiTags('logistics')
@RequirePermissions('logistics:read')
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get('tariff-sets')
  listTariffSets() {
    return this.logistics.listTariffSets();
  }

  @Get('tariff-sets/:id')
  getTariffSet(@Param('id') id: string) {
    return this.logistics.getTariffSet(id);
  }

  @Post('quote')
  quote(@Body() dto: QuoteLogisticsDto) {
    return this.logistics.quote(dto);
  }
}
