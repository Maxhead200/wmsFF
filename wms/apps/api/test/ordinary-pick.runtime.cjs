// TEST: load exact image modules with the isolated flag; no production data access.
require('reflect-metadata');const assert=require('node:assert/strict');const root=process.env.WMS_RUNTIME_ROOT||'/app/apps/api/dist';
const {ordinaryPickStatusLabel}=require(root+'/common/stock/ordinary-unmarked-pick');
const t={marketplace:'WILDBERRIES',requiresKiz:false,kiz:null,barcode:'123',sourceBoxPending:false,deviceCode:'TSD:test',status:'IN_PROGRESS'};
assert.equal(ordinaryPickStatusLabel(t,'В работе'),'Найдено');assert.equal(ordinaryPickStatusLabel({...t,status:'COMPLETED'},'Собрано'),'Упаковано');assert.equal(ordinaryPickStatusLabel({...t,deviceCode:'SOS-WB:test'},'В работе'),'В работе');
assert.equal(typeof require(root+'/common/stock/fbs-request-auto-status').reconcileFbsRequestStatus,'function');assert.equal(typeof require(root+'/modules/tsd/tsd-assembly.service').TsdAssemblyService,'function');assert.equal(typeof require(root+'/modules/marketplace-connections/marketplace-connections.service').MarketplaceConnectionsService,'function');
process.env.WMS_FBS_UNMARKED_PICK_CLOSE_ENABLED='false';assert.equal(ordinaryPickStatusLabel(t,'В работе'),'В работе');console.log('PASS packaged ordinary-pick modules and flag isolation');
