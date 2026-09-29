// FIX: preserve the verified production API except strict automatic-source validation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pins={"modules/stock/stock-operations.service.js": "aa6c1c19fe6d6ab0892f4555d47070e82758aa12886e15279f3b1844951ecf1c", "modules/client-requests/dto/update-client-request-status.dto.js": "2296c9f117873acea9beff94cdb9bb8a43e083e04d11dd5d24ceca1ead8598f2"};
for(const [name,pin]of Object.entries(pins)){
 const p=path.join(process.argv[2],name),s=fs.readFileSync(p,'utf8');if(crypto.createHash('sha256').update(s).digest('hex')!==pin)throw Error('Runtime drift '+name);
 let next=s;const edit=(a,b)=>{if(next.split(a).length!==2)throw Error('Marker drift '+a);next=next.replace(a,b);};
 if(name.endsWith('stock-operations.service.js')){
  edit('quantity: source.quantity,','quantity: source.quantity,requireAvailableStock: source.requireAvailableStock === true,');
  edit('incompleteFbsOrderIds.length > 0 && !confirmedSources','incompleteFbsOrderIds.length > 0 && (!confirmedSources || confirmedSources.some(source => source.requireAvailableStock))');
  edit('if (missing <= 0)\n                        continue;','if (missing <= 0)\n                        continue;\n                    if(source.requireAvailableStock)throw new common_1.BadRequestException(`Недостаточно остатка в коробе ${box?.code}: не хватает ${missing} шт. Выберите источник заново.`);');
 }else{
  const block='__decorate([\n    (0, class_validator_1.IsOptional)(),\n    (0, class_validator_1.IsBoolean)(),\n    __metadata("design:type", Boolean)\n], ClientRequestPhysicalStockSourceDto.prototype, "noBox", void 0);';
  edit(block,block+'\n'+block.replace('"noBox"','"requireAvailableStock"'));
 }
 fs.writeFileSync(p,next);
}
