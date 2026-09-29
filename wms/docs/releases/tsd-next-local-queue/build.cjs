// FIX: change only the two queue-loading branches in the verified deployed method.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../../node_modules/typescript');
function patch(source) {
  const tree = ts.createSourceFile('runtime.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const methods = [];
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name?.getText(tree) === 'getNextFbsTsdAssemblyUnlocked') methods.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (methods.length !== 1) throw Error('Missing or ambiguous queue method');
  const node = methods[0], start = node.getStart(tree), old = source.slice(start, node.end);
  const branch = 'else if (cached && cached.expiresAt > Date.now()) {';
  const merge = "if (!selectedRequestId || process.env.WMS_FBS_TSD_FAST_LOCAL_ENABLED !== 'true') {";
  for (const text of [branch, merge]) if (old.split(text).length !== 2) throw Error('Unexpected queue baseline');
  const next = old.replace(branch, `else if (process.env.WMS_FBS_TSD_FAST_LOCAL_ENABLED === 'true') {
                    // FIX: never hold the worker lock during a full marketplace/billing load.
                    response = await this.loadFbsTsdRequestOrders(clientId);
                }
                ${branch}`).replace(merge, "if (process.env.WMS_FBS_TSD_FAST_LOCAL_ENABLED !== 'true') {");
  const result = source.slice(0, start) + next + source.slice(node.end);
  new vm.Script(result);
  return result;
}
if (require.main === module) {
  if (!process.argv[2]) throw Error('Pass a verified materialized API runtime directory');
  const file = path.join(process.argv[2], 'modules/marketplace-connections/marketplace-connections.service.js');
  fs.writeFileSync(file, patch(fs.readFileSync(file, 'utf8')));
  console.log('Patched one runtime file; all other deployed bytes preserved.');
}
module.exports = { patch };
