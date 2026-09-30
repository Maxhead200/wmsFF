import { ModuleRef } from '@nestjs/core';
import { MarketplaceConnectionsService } from '../marketplace-connections/marketplace-connections.service';
import { BadRequestException, Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ClientScopeService } from '../auth/client-scope.service';
import type { AuthUser } from '../auth/auth.types';
import { assignReceiptBox, receiptChannelChange, receiptChannelsEnabled, receiptDocuments, requireReceiptChannelAdmin } from './receipt-channel-policy';

@Controller('warehouse/receipt-channels')
@RequirePermissions('warehouse:read')
export class ReceiptChannelsController {
  private readonly logger = new Logger(ReceiptChannelsController.name);
  constructor(private readonly prisma:PrismaService,private readonly scopes:ClientScopeService,private readonly modules:ModuleRef){}
  @Get()
  async list(@CurrentUser() user:AuthUser,@Query('clientId') clientId:string,@Query('from') from?:string,@Query('to') to?:string){
    if(typeof clientId!=='string'||!clientId.trim())throw new BadRequestException('Выберите клиента.');
    const warehouseId=requireReceiptChannelAdmin(user);this.scopes.requireClientAccess(user,clientId,'read');
    if(!receiptChannelsEnabled())return {enabled:false,rows:[]};
    const since=from&&/^\d{4}-\d{2}-\d{2}$/.test(from)?new Date(from+'T00:00:00+03:00'):new Date(Date.now()-30*86400000);
    const until=to&&/^\d{4}-\d{2}-\d{2}$/.test(to)?new Date(to+'T23:59:59+03:00'):new Date();
    if(!Number.isFinite(since.getTime())||!Number.isFinite(until.getTime())||since>until)throw new BadRequestException('Проверьте период приёмок.');
    const [docs,saved]=await Promise.all([receiptDocuments(this.prisma,clientId,warehouseId,since),this.prisma.systemSetting.findMany({where:{key:{startsWith:`receipt.channels.v1:${clientId}:`}},select:{value:true}})]);
    const rules=new Map(saved.map(s=>{const r=s.value as any;return [r.id,r] as const;}));
    return {enabled:true,rows:docs.filter(d=>d.current||new Date(d.date)<=until).map(d=>({...d,fbs:rules.get(d.id)?.fbs??true,fbo:rules.get(d.id)?.fbo??true,revision:rules.get(d.id)?.revision??0}))};
  }
  @Post('assign-box')
  @RequirePermissions('warehouse:write')
  async assign(@CurrentUser() user:AuthUser,@Body() body:any){
    if(!body||typeof body.clientId!=='string'||typeof body.id!=='string'||typeof body.boxCode!=='string'||!body.boxCode.trim()||typeof body.save!=='boolean')throw new BadRequestException('Укажите приёмку и короб.');
    const warehouseId=requireReceiptChannelAdmin(user);this.scopes.requireClientAccess(user,body.clientId,'write');
    const result=await this.prisma.$transaction(tx=>assignReceiptBox(tx,body.clientId,warehouseId,body.id,body.boxCode,user.id,body.save),{isolationLevel:'Serializable',timeout:30000});
    if(body.save)this.refresh(body.clientId);return result;
  }
  @Post('preview')
  @RequirePermissions('warehouse:write')
  preview(@CurrentUser() user:AuthUser,@Body() body:any){return this.change(user,body,false);}
  @Post()
  @RequirePermissions('warehouse:write')
  save(@CurrentUser() user:AuthUser,@Body() body:any){return this.change(user,body,true);}
  private async change(user:AuthUser,body:any,save:boolean){
    if(!body||typeof body.clientId!=='string'||!body.clientId.trim()||typeof body.id!=='string'||!/^[a-f0-9]{32}$/.test(body.id))throw new BadRequestException('Укажите клиента и приёмку.');
    const warehouseId=requireReceiptChannelAdmin(user);this.scopes.requireClientAccess(user,body.clientId,'write');
    const result=await this.prisma.$transaction(async tx=>{
      // FIX: serialize policy changes with each other; serializable scans retry stale reads.
      if(save)await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',`receipt-channels:${body.clientId}:${warehouseId}`);
      return receiptChannelChange(tx,body.clientId,warehouseId,body.id,body.fbs,body.fbo,body.revision,save,user.id);
    },{isolationLevel:save?'Serializable':'RepeatableRead',timeout:30000});
    if(save)this.refresh(body.clientId);return result;
  }
  private refresh(clientId:string){
    // FIX: schedule recalculation immediately; the existing periodic stock sync retries failures.
    // FIX: a failed background sync must not misreport a committed save as failed.
    void Promise.resolve().then(()=>this.modules.get(MarketplaceConnectionsService,{strict:false}).refreshReceiptChannelStocks(clientId))
      .catch(()=>this.logger.warn(`Receipt directions saved for ${clientId}; periodic WB stock synchronization will retry.`));
  }
}
