import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ServiceCenterService } from './service-center.service';

@ApiTags('service')
@RequirePermissions('system:admin')
@Controller('service')
export class ServiceCenterController {
  constructor(private readonly serviceCenter: ServiceCenterService) {}

  @Get('overview')
  getOverview() {
    return this.serviceCenter.getOverview();
  }

  @Get('sessions/online')
  listOnlineSessions() {
    return this.serviceCenter.listOnlineSessions();
  }

  @Get('client-ip-rules')
  listClientIpRules(@Query('clientId') clientId?: string) {
    return this.serviceCenter.listClientIpRules(clientId);
  }

  @Post('clients/:clientId/ip-rules')
  createClientIpRule(
    @Param('clientId') clientId: string,
    @Body() dto: { ipAddress?: string; comment?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceCenter.createClientIpRule(clientId, dto, user);
  }

  @Delete('client-ip-rules/:id')
  deleteClientIpRule(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.serviceCenter.deleteClientIpRule(id, user);
  }

  @Get('maintenance')
  getMaintenanceMode() {
    return this.serviceCenter.getMaintenanceMode();
  }

  @Patch('maintenance')
  updateMaintenanceMode(
    @Body() dto: { enabled?: boolean; message?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceCenter.updateMaintenanceMode(dto, user);
  }

  @Get('telegram')
  getTelegramSettings() {
    return this.serviceCenter.getTelegramSettings();
  }

  @Patch('telegram')
  updateTelegramSettings(
    @Body() dto: { enabled?: boolean; botToken?: string; fulfillmentChatIds?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceCenter.updateTelegramSettings(dto, user);
  }

  @Post('telegram/test')
  sendTelegramTest(@Body() dto: { chatId?: string; message?: string }) {
    return this.serviceCenter.sendTelegramTest(dto);
  }

  @Get('clients/:clientId/stock-cleanup')
  getClientStockCleanupPreview(@Param('clientId') clientId: string) {
    return this.serviceCenter.getClientStockCleanupPreview(clientId);
  }

  @Post('clients/:clientId/stock-cleanup')
  purgeClientStock(
    @Param('clientId') clientId: string,
    @Body('confirmation') confirmation: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceCenter.purgeClientStock(clientId, confirmation, user);
  }

  @Get('clients/:clientId/request-cleanup')
  getClientRequestCleanupPreview(@Param('clientId') clientId: string) {
    return this.serviceCenter.getClientRequestCleanupPreview(clientId);
  }

  @Post('clients/:clientId/request-cleanup')
  purgeClientRequests(
    @Param('clientId') clientId: string,
    @Body('confirmation') confirmation: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceCenter.purgeClientRequests(clientId, confirmation, user);
  }

  @Get('nomenclature')
  listNomenclature(@Query('search') search?: string) {
    return this.serviceCenter.listNomenclature({ search });
  }

  @Delete('nomenclature/:id')
  deleteNomenclatureItem(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.serviceCenter.deleteNomenclatureItem(id, user);
  }

  @Get('billing-services')
  listBillingServices() {
    return this.serviceCenter.listBillingServices();
  }

  @Post('billing-services')
  createBillingService(
    @Body() dto: { code: string; name: string; unit?: never; defaultPriceRub?: number; isActive?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceCenter.createBillingService(dto, user);
  }

  @Patch('billing-services/:id/status')
  updateBillingServiceStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() user: AuthUser,
  ) {
    return this.serviceCenter.updateBillingServiceStatus(id, isActive === true, user);
  }

  @Delete('billing-services/:id')
  deleteBillingService(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.serviceCenter.deleteBillingService(id, user);
  }
}
