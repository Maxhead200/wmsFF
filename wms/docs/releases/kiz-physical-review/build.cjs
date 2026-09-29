// FIX: preserve the deployed queue and change only authenticated approval call sites.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const [tsPath, candidate] = process.argv.slice(2);
const ts = require(path.resolve(tsPath));
const queuePath = path.join(candidate, 'common/kiz-review-queue.js');
let queue = fs.readFileSync(queuePath, 'utf8');
const helperPath = path.join(candidate, 'common/kiz-cancelled-reuse.js');
if (crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex') !== 'bfa28a8c7545abdf8233756f313a4052296325ec1656acf556d3a0e0b7dce39e') throw Error('Binding helper baseline changed; review required');
if (crypto.createHash('sha256').update(queue).digest('hex') !== 'f36fee1d6ca9dbf3c7ef4f03f85330244d80b93f8f461ad73c1bd1cddc3df5b1') throw Error('Queue baseline changed; review required');
for (const [before, after] of [
  ['evidence, user.id, id, task.id);', 'evidence, user.id, id, task.id, true);'],
  ["evidence, user.id, 'unit:' + markId);", "evidence, user.id, 'unit:' + markId, '', true);"],
]) {
  if (queue.split(before).length !== 2) throw Error('Approval call site changed');
  queue = queue.replace(before, after);
}
const source = fs.readFileSync(path.join(__dirname, 'source/kiz-cancelled-reuse.ts'), 'utf8');
const result = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}, reportDiagnostics: true});
if (result.diagnostics?.length) throw Error('Compilation diagnostics');
fs.writeFileSync(path.join(candidate, 'common/kiz-cancelled-reuse.js'), result.outputText);
fs.writeFileSync(queuePath, queue);
