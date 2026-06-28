import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
}
