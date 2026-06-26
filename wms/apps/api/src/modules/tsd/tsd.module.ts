import { Module } from '@nestjs/common';
import { TsdSyncController } from './tsd-sync.controller';

@Module({
  controllers: [TsdSyncController],
})
export class TsdModule {}
