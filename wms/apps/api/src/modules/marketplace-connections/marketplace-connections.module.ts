import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MarketplaceConnectionsController } from './marketplace-connections.controller';
import { MarketplaceConnectionsService } from './marketplace-connections.service';

@Module({
  imports: [AuthModule],
  controllers: [MarketplaceConnectionsController],
  providers: [MarketplaceConnectionsService],
})
export class MarketplaceConnectionsModule {}
