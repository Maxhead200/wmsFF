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
@RequirePermissions('tsd:use')
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
  listClients(@CurrentUser() user: AuthUser) {
    return this.sync.listClients(user);
  }

  @Get('requests/active')
  listActiveRequests(@CurrentUser() user: AuthUser) {
    return this.sync.listActiveRequests(user);
  }

  @Get('requests/:id/box-search')
  getRequestBoxSearch(
    @Param('id') id: string,
    @Query('deviceCode') deviceCode: string,
    @Query('stage') stage: string | undefined,
    @Query('managerCode') managerCode: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.getRequestBoxSearch(id, user, deviceCode, stage, managerCode);
  }

  @Post('requests/:id/box-search/scan')
  scanRequestBox(@Param('id') id: string, @Body() dto: { boxCode?: string; deviceCode?: string; managerCode?: string }, @CurrentUser() user: AuthUser) {
    return this.sync.scanRequestBox(id, dto, user);
  }

  @Get('requests/:id/relabel')
  getRequestRelabel(
    @Param('id') id: string,
    @Query('deviceCode') deviceCode: string,
    @Query('managerCode') managerCode: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.getRequestRelabel(id, user, deviceCode, managerCode);
  }

  @Post('requests/:id/relabel/scan-source')
  scanRelabelSource(
    @Param('id') id: string,
    @Body() dto: { boxCode?: string; barcode?: string; deviceCode?: string; managerCode?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.scanRelabelSource(id, dto, user);
  }

  @Post('requests/:id/relabel/scan-target')
  scanRelabelTarget(
    @Param('id') id: string,
    @Body() dto: { lineId?: string; targetBarcode?: string; deviceCode?: string; managerCode?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.scanRelabelTarget(id, dto, user);
  }

  @Get('requests/:id/moves')
  getRequestMoves(
    @Param('id') id: string,
    @Query('deviceCode') deviceCode: string,
    @Query('managerCode') managerCode: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.getRequestMoves(id, user, deviceCode, managerCode);
  }

  @Post('requests/:id/moves/target-box')
  openMoveTargetBox(
    @Param('id') id: string,
    @Body() dto: { targetBoxCode?: string; deviceCode?: string; managerCode?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.openMoveTargetBox(id, dto, user);
  }

  @Post('requests/:id/moves/scan-item')
  scanMoveItem(
    @Param('id') id: string,
    @Body() dto: { sourceBox?: string; barcode?: string; targetBoxCode?: string; deviceCode?: string; managerCode?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.scanMoveItem(id, dto, user);
  }

  @Post('requests/:id/moves/finish')
  finishRequestMoves(@Param('id') id: string, @Body() dto: { deviceCode?: string; managerCode?: string }, @CurrentUser() user: AuthUser) {
    return this.sync.finishRequestMoves(id, dto, user);
  }

  @Get('requests/:id/boxless-packing')
  getBoxlessPacking(@Param('id') id: string, @Query('deviceCode') deviceCode: string, @CurrentUser() user: AuthUser) {
    return this.sync.getBoxlessPacking(id, user, deviceCode);
  }

  @Post('requests/:id/boxless-packing/open-box')
  openBoxlessPackingBox(
    @Param('id') id: string,
    @Body() dto: { boxCode?: string; deviceCode?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.openBoxlessPackingBox(id, dto, user);
  }

  @Post('requests/:id/boxless-packing/scan-item')
  scanBoxlessPackingItem(
    @Param('id') id: string,
    @Body() dto: { barcode?: string; deviceCode?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sync.scanBoxlessPackingItem(id, dto, user);
  }

  @Post('requests/:id/boxless-packing/close-box')
  closeBoxlessPackingBox(@Param('id') id: string, @Body() dto: { deviceCode?: string }, @CurrentUser() user: AuthUser) {
    return this.sync.closeBoxlessPackingBox(id, dto, user);
  }

  @Post('requests/:id/boxless-packing/finish')
  finishBoxlessPacking(@Param('id') id: string, @Body() dto: { deviceCode?: string }, @CurrentUser() user: AuthUser) {
    return this.sync.finishBoxlessPacking(id, dto, user);
  }

  @Get('sku-by-barcode')
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
