import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreatePickWaveDto } from './dto/create-pick-wave.dto';
import { FulfillClientRequestDto } from './dto/fulfill-client-request.dto';
import { ListPickWavesDto } from './dto/list-pick-waves.dto';
import { ListStockBalancesDto } from './dto/list-stock-balances.dto';
import { PickClientRequestDto } from './dto/pick-client-request.dto';
import { RunPickWaveDto } from './dto/run-pick-wave.dto';
import { TransferBetweenBoxesDto } from './dto/transfer-between-boxes.dto';
import { FulfillmentWaveService } from './fulfillment-wave.service';
import { PickInstructionService } from './pick-instruction.service';
import { PickWaveDocumentService } from './pick-wave-document.service';
import { StockBalancesService } from './stock-balances.service';
import { StockOperationsService } from './stock-operations.service';

@ApiTags('stock')
@RequirePermissions('stock:read')
@Controller('stock')
export class StockController {
  constructor(
    private readonly balances: StockBalancesService,
    private readonly operations: StockOperationsService,
    private readonly waves: FulfillmentWaveService,
    private readonly waveDocuments: PickWaveDocumentService,
    private readonly pickInstructions: PickInstructionService,
  ) {}

  @Get('balances')
  listBalances(@Query() query: ListStockBalancesDto, @CurrentUser() user: AuthUser) {
    return this.balances.list(query, user);
  }

  @Post('transfers/box-to-box')
  @RequirePermissions('stock:write')
  transferBetweenBoxes(@Body() dto: TransferBetweenBoxesDto, @CurrentUser() user: AuthUser) {
    return this.operations.transferBetweenBoxes(dto, user);
  }

  @Post('fulfillment/pick-request')
  @RequirePermissions('stock:write')
  pickClientRequest(@Body() dto: PickClientRequestDto, @CurrentUser() user: AuthUser) {
    return this.operations.pickClientRequest(dto, user);
  }

  @Get('fulfillment/waves')
  @RequirePermissions('stock:write')
  listPickWaves(@Query() query: ListPickWavesDto, @CurrentUser() user: AuthUser) {
    return this.waves.listWaves(query, user);
  }

  @Post('fulfillment/waves')
  @RequirePermissions('stock:write')
  createPickWave(@Body() dto: CreatePickWaveDto, @CurrentUser() user: AuthUser) {
    return this.waves.createWave(dto, user);
  }

  @Post('fulfillment/waves/:id/pick')
  @RequirePermissions('stock:write')
  runPickWave(@Param('id') id: string, @Body() dto: RunPickWaveDto, @CurrentUser() user: AuthUser) {
    return this.waves.runWave(id, dto, user);
  }

  @Get('fulfillment/waves/:id/document')
  @RequirePermissions('stock:write')
  getPickWaveDocument(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.waveDocuments.getWaveDocument(id, user);
  }

  @Get('fulfillment/requests/:id/instruction')
  @RequirePermissions('stock:write')
  getPickInstruction(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pickInstructions.getRequestInstruction(id, user);
  }

  @Get('fulfillment/requests/:id/instruction.xlsx')
  @RequirePermissions('stock:write')
  async downloadPickInstructionXlsx(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.pickInstructions.getRequestInstructionXlsx(id, user);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.content.length));
    response.setHeader('Content-Disposition', contentDisposition(file.fileName));

    return new StreamableFile(file.content);
  }

  @Post('fulfillment/package-request')
  @RequirePermissions('stock:write')
  packageClientRequest(@Body() dto: FulfillClientRequestDto, @CurrentUser() user: AuthUser) {
    return this.operations.packageClientRequest(dto, user);
  }

  @Post('fulfillment/ship-request')
  @RequirePermissions('stock:write')
  shipClientRequest(@Body() dto: FulfillClientRequestDto, @CurrentUser() user: AuthUser) {
    return this.operations.shipClientRequest(dto, user);
  }
}

function contentDisposition(fileName: string) {
  const asciiName = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, '');
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
