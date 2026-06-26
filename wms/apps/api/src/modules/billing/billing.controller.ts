import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BillingService } from './billing.service';
import { CreateBillingChargeDto } from './dto/create-billing-charge.dto';
import { CreateBillingInvoiceDto } from './dto/create-billing-invoice.dto';
import { CreateBillingPaymentDto } from './dto/create-billing-payment.dto';
import { CreateBillingServiceDto } from './dto/create-billing-service.dto';
import { GenerateStorageChargeDto } from './dto/generate-storage-charge.dto';
import { ListBillingChargesDto } from './dto/list-billing-charges.dto';
import { ListBillingInvoicesDto } from './dto/list-billing-invoices.dto';
import { UpdateBillingChargeStatusDto } from './dto/update-billing-charge-status.dto';
import { UpdateBillingInvoiceStatusDto } from './dto/update-billing-invoice-status.dto';

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

  @Post('charges/storage')
  @RequirePermissions('billing:write')
  generateStorageCharge(@Body() dto: GenerateStorageChargeDto, @CurrentUser() user: AuthUser) {
    return this.billing.generateStorageCharge(dto, user);
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

  @Get('invoices')
  listInvoices(@Query() query: ListBillingInvoicesDto, @CurrentUser() user: AuthUser) {
    return this.billing.listInvoices(query, user);
  }

  @Post('invoices')
  @RequirePermissions('billing:write')
  createInvoice(@Body() dto: CreateBillingInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.billing.createInvoice(dto, user);
  }

  @Patch('invoices/:id/status')
  @RequirePermissions('billing:write')
  updateInvoiceStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBillingInvoiceStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.updateInvoiceStatus(id, dto, user);
  }

  @Post('payments')
  @RequirePermissions('billing:write')
  createPayment(@Body() dto: CreateBillingPaymentDto, @CurrentUser() user: AuthUser) {
    return this.billing.createPayment(dto, user);
  }
}
