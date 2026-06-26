import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ScanOperationDto, SyncTsdOperationsDto } from './dto/scan-operation.dto';
import { TsdSyncService } from './tsd-sync.service';

@ApiTags('tsd')
@RequirePermissions('stock:write')
@Controller('tsd')
export class TsdSyncController {
  constructor(private readonly sync: TsdSyncService) {}

  @Post('operations')
  acceptOperation(@Body() operation: ScanOperationDto, @CurrentUser() user: AuthUser) {
    return this.sync.acceptOperation(operation, user);
  }

  @Post('sync')
  syncOperations(@Body() dto: SyncTsdOperationsDto, @CurrentUser() user: AuthUser) {
    return this.sync.syncOperations(dto, user);
  }
}
