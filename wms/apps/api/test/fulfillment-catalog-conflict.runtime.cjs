// TEST: run against the exact deployed/candidate method without opening a database.
// node test/fulfillment-catalog-conflict.runtime.cjs <stock-operations.service.js>
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const text = fs.readFileSync(process.argv[2], 'utf8');
const source = ts.createSourceFile('runtime.js', text, ts.ScriptTarget.Latest, true);
let method;
function visit(node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'ensureStandardFulfillmentService') method = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(method, 'Expected runtime method');
function fixture(enabled) {
  const service = vm.runInNewContext('({' + method + '})', {
    process: { env: { WMS_FULFILLMENT_CATALOG_READ_FIRST: enabled ? 'true' : 'false' } },
    client_1: { BillingPriceTaxMode: { INCLUDED: 'INCLUDED' } },
  });
  const row = { code: 'box', name: 'Box', unit: 'PIECE', defaultPriceRub: 50 };
  const catalog = { ...row, id: 'service', isActive: true };
  const price = { id: 'price', priceRub: 17, isActive: false, taxMode: 'INCLUDED' };
  let writes = 0;
  const tx = {
    billingService: { findUnique: async () => catalog, upsert: async () => { writes++; return catalog; } },
    clientBillingService: { findUnique: async () => price, upsert: async () => { writes++; return price; } },
  };
  return { tx, catalog, price, writes: () => writes, run: () => service.ensureStandardFulfillmentService(tx, 'client', row, 'user') };
}
test('enabled candidate finishes with no shared catalog writes; disabled retains old path', async () => {
  for (const enabled of [true, false]) {
    const f = fixture(enabled);
    const result = await f.run();
    assert.equal(result.clientPrice, f.price);
    assert.equal(f.writes(), enabled ? 0 : 2);
  }
});
test('concurrent completions do not contend on the unchanged catalog', async () => {
  const f = fixture(true);
  f.tx.billingService.upsert = async () => { throw Object.assign(Error('write conflict'), {code: 'P2034'}); };
  const results = await Promise.all(Array.from({length: 20}, () => f.run()));
  assert.equal(results.length, 20);
  assert.equal(f.writes(), 0);
});
