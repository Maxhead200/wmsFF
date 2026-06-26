import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateDeliveryRequestDto } from './dto/create-delivery-request.dto';
import { ListDeliveryRequestsDto } from './dto/list-delivery-requests.dto';
import { QuoteLogisticsDto } from './dto/quote-logistics.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
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

  @Get('delivery-requests')
  listDeliveryRequests(@Query() query: ListDeliveryRequestsDto, @CurrentUser() user: AuthUser) {
    return this.logistics.listDeliveryRequests(query, user);
  }

  @Post('delivery-requests')
  @RequirePermissions('logistics:request')
  createDeliveryRequest(@Body() dto: CreateDeliveryRequestDto, @CurrentUser() user: AuthUser) {
    return this.logistics.createDeliveryRequest(dto, user);
  }

  @Patch('delivery-requests/:id/status')
  @RequirePermissions('logistics:write')
  updateDeliveryStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.logistics.updateDeliveryStatus(id, dto, user);
  }
}
