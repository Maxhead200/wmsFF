import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScanOperationDto } from './dto/scan-operation.dto';

@ApiTags('tsd')
@Controller('tsd')
export class TsdSyncController {
  @Post('operations')
  acceptOperation(@Body() operation: ScanOperationDto) {
    // Русский комментарий: operationKey нужен для идемпотентности, особенно когда появится offline outbox.
    return {
      operationKey: operation.operationKey,
      status: 'ACCEPTED',
      serverTime: new Date().toISOString(),
    };
  }
}
