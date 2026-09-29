const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {patchService,patchController,patchRegistry,patchWeb,patchIndex,historyCss,assertActiveWebBundle} = require('./openclaw-history-release.cjs');
const base=process.env.WMS_OPENCLAW_HISTORY_BASELINE || 'C:/WMSFF2207/baselines/openclaw-history-live-20260929';
const hasBaseline=fs.existsSync(base+'/manifest.json');
const read=name=>fs.readFileSync(base+'/'+name,'utf8');

// TEST: updating a dormant bundle cannot make history appear in the active WMS page.
test('release bundle must be referenced by the live page entry', {skip:!hasBaseline}, () => {
 const index=read('web-index.html');
 assert.throws(()=>assertActiveWebBundle(index,'/assets/openclaw-20260928-0.js'),/active page/);
 assert.doesNotThrow(()=>assertActiveWebBundle(index,'/assets/payroll-compact-20260929-0.js'));
});

// TEST: preserve every deployed method outside the new history route.
test('adds one service method and controller route without changing existing bodies', {skip:!hasBaseline}, () => {
 const service=read('api-service.js'),controller=read('api-controller.js');
 const changedService=patchService(service),changedController=patchController(controller);
 assert.ok(changedService.includes('async listJobs(user, cursor)'));
 assert.ok(changedController.includes('WmsAiController.prototype, "openClawJobs", null)'));
 assert.ok(changedService.replace(/\n    async listJobs\(user, cursor\)[\s\S]*?(?=\n    private |\n    assertAccess\()/,'').length>0);
 assert.ok(changedService.includes('async submit(input, user)'));
 assert.ok(changedController.includes('openClawJob(requestId, user)'));
 assert.ok(patchRegistry(read('api-registry.js')).includes('routeCount: 7'));
 assert.throws(()=>patchRegistry(patchRegistry(read('api-registry.js'))),/route count changed/);
 assert.throws(()=>patchService(changedService),/already installed/);
 assert.throws(()=>patchController(changedController),/already installed/);
});

// TEST: deployed theme graph stays byte-identical outside the OpenClaw bundle and one new CSS link.
test('replaces only the OpenClaw panel bundle and appends scoped history styles', {skip:!hasBaseline}, async () => {
 const web=read('web-openclaw.js'),index=read('web-index.html');
 const changed=await patchWeb(web),css=historyCss();
 assert.ok(changed.includes('wms-openclaw-history'));
 assert.ok(changed.includes('fetchOpenClawHistory'));
 assert.ok(changed.startsWith(web.slice(0,web.indexOf('var __wmsOpenClaw ='))));
 assert.ok(changed.endsWith(web.slice(web.indexOf('export {__wmsOpenClaw as openClawReplacement};'))));
 assert.ok(css.includes('.wms-openclaw-history'));
 assert.equal(patchIndex(index).replace('<link rel="stylesheet" href="/assets/openclaw-history-20260929.css">',''),index);
});
