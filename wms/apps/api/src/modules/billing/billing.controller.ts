import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BillingService } from './billing.service';
import { CreateBillingChargeDto } from './dto/create-billing-charge.dto';
import { CreateBillingServiceDto } from './dto/create-billing-service.dto';
import { ListBillingChargesDto } from './dto/list-billing-charges.dto';
import { UpdateBillingChargeStatusDto } from './dto/update-billing-charge-status.dto';

@ApiTags('billing')
@RequirePermissions('billing:read')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('services')
  listServices() {
    return this.billing.listServices();
  }

  @Post('services')
  @RequirePermissions('billing:write')
  createService(@Body() dto: CreateBillingServiceDto, @CurrentUser() user: AuthUser) {
    return this.billing.createService(dto, user);
  }

  @Get('charges')
  listCharges(@Query() query: ListBillingChargesDto, @CurrentUser() user: AuthUser) {
    return this.billing.listCharges(query, user);
  }

  @Post('charges')
  @RequirePermissions('billing:write')
  createCharge(@Body() dto: CreateBillingChargeDto, @CurrentUser() user: AuthUser) {
    return this.billing.createCharge(dto, user);
  }

  @Patch('charges/:id/status')
  @RequirePermissions('billing:write')
  updateChargeStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBillingChargeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.updateChargeStatus(id, dto, user);
  }
}
