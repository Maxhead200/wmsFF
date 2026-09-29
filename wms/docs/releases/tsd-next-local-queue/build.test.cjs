const { test } = require('node:test');
const assert = require('node:assert/strict');
const { patch } = require('./build.cjs');
const method = `async getNextFbsTsdAssemblyUnlocked(){
 if(selectedRequestId) {} else if (cached && cached.expiresAt > Date.now()) {response=cached.value;}
 if (!selectedRequestId || process.env.WMS_FBS_TSD_FAST_LOCAL_ENABLED !== 'true') {await this.mergeSyncedFbsTsdRequestOrders();}
}`;
// TEST: later published methods and everything outside the queue remain byte-identical.
test('patches only the intended method and refuses a repeated overlay', () => {
  const before = 'class Service {\n', after = '\nasync other(){return "preserved";}\n}\n';
  const result = patch(before + method + after);
  assert.ok(result.startsWith(before)); assert.ok(result.endsWith(after));
  assert.ok(result.includes('response = await this.loadFbsTsdRequestOrders(clientId)'));
  assert.throws(() => patch(result), /Unexpected queue baseline/);
});
// TEST: an unknown or ambiguous deployed implementation must not be overwritten.
test('rejects missing, changed and duplicated queue methods', () => {
  assert.throws(() => patch('class Service {}'), /Missing or ambiguous/);
  assert.throws(() => patch('class Service {' + method.replace('cached.expiresAt', 'changed.expiresAt') + '}'), /Unexpected queue baseline/);
  assert.throws(() => patch('class Service {' + method + method + '}'), /Missing or ambiguous/);
});
