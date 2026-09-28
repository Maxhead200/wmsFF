import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ProductDisplayController } from './product-display.controller';
import { ProductDisplayService } from './product-display.service';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ProductDisplayInterceptor } from './product-display.interceptor';

@Module({
  imports: [AuthModule],
  controllers: [ClientsController, ProductDisplayController],
  providers: [ClientsService, ProductDisplayService, { provide: APP_INTERCEPTOR, useClass: ProductDisplayInterceptor }],
  exports: [ClientsService],
})
export class ClientsModule {}
