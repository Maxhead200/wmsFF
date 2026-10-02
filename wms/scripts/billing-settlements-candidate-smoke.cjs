// TEST: load real Nest/Prisma runtime without network or DB access; check route and feature gate.
require('reflect-metadata');const assert=require('node:assert/strict');
const {BillingModule}=require('./dist/modules/billing/billing.module');
const {BillingSettlementsController}=require('./dist/modules/billing/billing-settlements.controller');
const {BillingSettlementsService}=require('./dist/modules/billing/billing-settlements.service');
const {settlementDates}=require('./dist/modules/billing/billing-settlements.service');
const controllers=Reflect.getMetadata('controllers',BillingModule),providers=Reflect.getMetadata('providers',BillingModule);
assert(controllers.includes(BillingSettlementsController));assert(providers.includes(BillingSettlementsService));assert.equal(Reflect.getMetadata('path',BillingSettlementsController),'billing/settlements');assert.throws(()=>settlementDates('2026-02-30','2026-03-01'));
(async()=>{delete process.env.WMS_BILLING_SETTLEMENTS_ENABLED;const no=new Proxy({},{get(){throw Error('Unexpected DB access')}});assert.deepEqual(await new BillingSettlementsService(no,no).list({},{}),{enabled:false});process.env.WMS_BILLING_SETTLEMENTS_ENABLED='true';await assert.rejects(()=>new BillingSettlementsService(no,no).list({}, {permissionCodes:[]}));console.log('PASS actual Nest registration, route, dates, disabled gate without DB access, permission denial');})().catch(e=>{console.error(e.message);process.exitCode=1});
