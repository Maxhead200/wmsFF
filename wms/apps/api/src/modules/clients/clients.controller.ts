import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateClientDto } from './dto/create-client.dto';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list() {
    return this.clients.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.clients.get(id);
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }
}
