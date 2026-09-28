import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile, ConflictException } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireAnyPermissions, RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { AuthUser } from '../auth/auth.types';
import { WmsAiChatDto, WmsAiLearnDto } from './dto/wms-ai-chat.dto';
import { WmsAiService, type WmsAiTool } from './wms-ai.service';
import { WMS_AI_XLSX_MIME } from './wms-ai-xlsx';
import { WmsOpenClawService, openClawEnabled } from './wms-openclaw.service';
import { WmsOpenClawJobDto } from './dto/wms-openclaw-job.dto';

@Controller('wms-ai')
@RequirePermissions('warehouse:read', 'stock:read')
export class WmsAiController {
  constructor(private readonly service: WmsAiService, private readonly openClaw: WmsOpenClawService) {}

  // FIX: durable jobs keep browser retries from replaying server changes.
  @Get('openclaw/status')
  @RequirePermissions()
  openClawStatus(@CurrentUser() user: AuthUser) { return this.openClaw.status(user); }

  @Post('openclaw/jobs')
  @RequirePermissions()
  openClawSubmit(@Body() dto: WmsOpenClawJobDto, @CurrentUser() user: AuthUser) { return this.openClaw.submit(dto, user); }

  @Get('openclaw/jobs/:requestId')
  @RequirePermissions()
  openClawJob(@Param('requestId') requestId: string, @CurrentUser() user: AuthUser) { return this.openClaw.get(requestId, user); }

  @Post('chat')
  chat(@Body() dto: WmsAiChatDto, @CurrentUser() user: AuthUser) {
    if (openClawEnabled()) throw new ConflictException('ИИ заменён на OpenClaw. Обновите страницу и используйте новый чат.');
    return this.service.chat(dto.message, user);
  }

  @Post('knowledge')
  @RequireAnyPermissions('warehouse:write', 'stock:write')
  learn(@Body() dto: WmsAiLearnDto, @CurrentUser() user: AuthUser) {
    if (openClawEnabled()) throw new ConflictException('База знаний теперь ведётся в OpenClaw.');
    return this.service.learn(dto, user);
  }

  @Get('export.xlsx')
  async export(
    @Query('tool') tool: WmsAiTool,
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.export(
      tool,
      {
        search: query.search,
        boxCode: query.boxCode,
        palletCode: query.palletCode,
        maxTotal: query.maxTotal ? Number(query.maxTotal) : undefined,
        minTotal: query.minTotal ? Number(query.minTotal) : undefined,
        clientSearch: query.clientSearch,
        requestNumber: query.requestNumber ? Number(query.requestNumber) : undefined,
        days: query.days ? Number(query.days) : undefined,
        status: query.status,
      },
      user,
    );
    response.setHeader('Content-Type', WMS_AI_XLSX_MIME);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="wms-ai.xlsx"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    return new StreamableFile(file.buffer);
  }
}
