import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ImportsService } from './imports.service';

@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('stocks/preview')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: 'XLSX-файл остатков и clientId' })
  @UseInterceptors(FileInterceptor('file'))
  previewStockFile(@UploadedFile() file: Express.Multer.File, @Body('clientId') clientId: string) {
    return this.importsService.previewStockWorkbook(file.buffer, clientId);
  }

  @Post('stocks/commit')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: 'XLSX-файл остатков, clientId и sourceDocument' })
  @UseInterceptors(FileInterceptor('file'))
  commitStockFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('clientId') clientId: string,
    @Body('sourceDocument') sourceDocument?: string,
  ) {
    return this.importsService.commitStockWorkbook(file.buffer, {
      clientId,
      sourceDocument: sourceDocument || file.originalname,
    });
  }

  @Post('logistics/preview')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: 'XLSX-файл тарифов логистики' })
  @UseInterceptors(FileInterceptor('file'))
  previewLogisticsFile(@UploadedFile() file: Express.Multer.File) {
    return this.importsService.previewLogisticsWorkbook(file.buffer);
  }
}
