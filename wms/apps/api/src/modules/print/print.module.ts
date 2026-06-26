import { Module } from '@nestjs/common';
import { PrintController } from './print.controller';
import { TsplLabelService } from './tspl-label.service';

@Module({
  controllers: [PrintController],
  providers: [TsplLabelService],
  exports: [TsplLabelService],
})
export class PrintModule {}
