import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { StockModule } from '../stock/stock.module';
import { ClientRequestDocumentService } from './client-request-document.service';
import { ClientRequestFilesService } from './client-request-files.service';
import { ClientRequestHistoryService } from './client-request-history.service';
import { ClientRequestMarketplaceTemplateService } from './client-request-marketplace-template.service';
import { ClientRequestPdfService } from './client-request-pdf.service';
import { ClientRequestXlsxService } from './client-request-xlsx.service';
import { ClientRequestsController } from './client-requests.controller';
import { ClientRequestsService } from './client-requests.service';

@Module({
  imports: [AuthModule, CommonModule, StockModule],
  controllers: [ClientRequestsController],
  providers: [
    ClientRequestsService,
    ClientRequestDocumentService,
    ClientRequestPdfService,
    ClientRequestFilesService,
    ClientRequestHistoryService,
    ClientRequestMarketplaceTemplateService,
    ClientRequestXlsxService,
  ],
})
export class ClientRequestsModule {}
