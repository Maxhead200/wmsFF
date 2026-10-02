import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BillingSettlementsService } from './billing-settlements.service';

export class BillingSettlementsQuery {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) periodFrom!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) periodTo!: string;
  @IsOptional() @IsString() clientId?: string;
}
// FIX: additive route leaves existing billing controllers and calculations intact.
@Controller('billing/settlements')
@RequirePermissions('billing:read')
export class BillingSettlementsController {
  constructor(private readonly settlements: BillingSettlementsService) {}
  @Get()
  list(@Query() query: BillingSettlementsQuery, @CurrentUser() user: AuthUser) { return this.settlements.list(query, user); }
}
