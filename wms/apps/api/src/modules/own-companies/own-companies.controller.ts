import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UpsertOwnCompanyDto } from './dto/upsert-own-company.dto';
import { OwnCompaniesService } from './own-companies.service';

@ApiTags('own-companies')
@RequirePermissions('billing:read')
@Controller('own-companies')
export class OwnCompaniesController {
  constructor(private readonly ownCompanies: OwnCompaniesService) {}

  @Get()
  list() {
    return this.ownCompanies.list();
  }

  @Post()
  @RequirePermissions('billing:write')
  create(@Body() dto: UpsertOwnCompanyDto) {
    return this.ownCompanies.create(dto);
  }

  @Put(':id')
  @RequirePermissions('billing:write')
  update(@Param('id') id: string, @Body() dto: UpsertOwnCompanyDto) {
    return this.ownCompanies.update(id, dto);
  }
}
