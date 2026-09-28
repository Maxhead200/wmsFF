// TEST: a saved subscription profile needs an activatable Codex runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('subscription authentication has an enabled Codex runtime', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'openclaw.json'), 'utf8'));
  assert.equal(config.plugins?.entries?.codex?.enabled, true);
});

test('Codex activation keeps the private gateway and WMS agent boundaries', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'openclaw.json'), 'utf8'));
  assert.equal(config.gateway.customBindHost, '172.18.0.1');
  assert.equal(config.gateway.controlUi.enabled, false);
  assert.equal(config.gateway.auth.token.source, 'env');
  assert.deepEqual(Object.keys(config.agents.entries), ['wms']);
  assert.equal(config.tools.exec.host, 'gateway');
});
