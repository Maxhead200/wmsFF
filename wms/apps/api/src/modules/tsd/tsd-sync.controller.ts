import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ResolveTsdReviewDto } from './dto/resolve-tsd-review.dto';
import { ScanOperationDto, SyncTsdOperationsDto } from './dto/scan-operation.dto';
import { TsdReviewService } from './tsd-review.service';
import { TsdSyncService } from './tsd-sync.service';

@ApiTags('tsd')
@RequirePermissions('stock:write')
@Controller('tsd')
export class TsdSyncController {
  constructor(
    private readonly sync: TsdSyncService,
    private readonly review: TsdReviewService,
  ) {}

  @Get('review')
  @RequirePermissions('stock:write')
  listReviewQueue(@CurrentUser() user: AuthUser) {
    return this.sync.listReviewQueue(user);
  }

  @Get('clients')
  @RequirePermissions('stock:write')
  listClients(@CurrentUser() user: AuthUser) {
    return this.sync.listClients(user);
  }

  @Get('requests/active')
  @RequirePermissions('stock:write')
  listActiveRequests(@CurrentUser() user: AuthUser) {
    return this.sync.listActiveRequests(user);
  }

  @Get('sku-by-barcode')
  @RequirePermissions('stock:write')
  getSkuByBarcode(@Query('clientId') clientId: string, @Query('barcode') barcode: string, @CurrentUser() user: AuthUser) {
    return this.sync.getSkuByBarcode(clientId, barcode, user);
  }

  @Get('review/history')
  @RequirePermissions('stock:write')
  listReviewHistory(@CurrentUser() user: AuthUser) {
    return this.review.listReviewHistory(user);
  }

  @Post('operations')
  acceptOperation(@Body() operation: ScanOperationDto, @CurrentUser() user: AuthUser) {
    return this.sync.acceptOperation(operation, user);
  }

  @Post('sync')
  syncOperations(@Body() dto: SyncTsdOperationsDto, @CurrentUser() user: AuthUser) {
    return this.sync.syncOperations(dto, user);
  }

  @Patch('review/:id')
  @RequirePermissions('stock:write')
  resolveReviewOperation(
    @Param('id') id: string,
    @Body() dto: ResolveTsdReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.review.resolveReviewOperation(id, dto, user);
  }
}
