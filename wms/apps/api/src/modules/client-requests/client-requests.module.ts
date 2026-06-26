import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { ClientRequestDocumentService } from './client-request-document.service';
import { ClientRequestsController } from './client-requests.controller';
import { ClientRequestsService } from './client-requests.service';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [ClientRequestsController],
  providers: [ClientRequestsService, ClientRequestDocumentService],
})
export class ClientRequestsModule {}
