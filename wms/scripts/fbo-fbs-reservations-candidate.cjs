// FIX: patch only the verified published service; preserve runtime-only FBO features.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript');
const root=path.resolve(__dirname,'..'),target=process.argv[2];
if(!target)throw Error('Usage: node scripts/fbo-fbs-reservations-candidate.cjs <materialized runtime>');
const file=path.join(target,'modules/tsd/fbo-two-stage.service.js');
let s=fs.readFileSync(file,'utf8');
if(crypto.createHash('sha256').update(s).digest('hex')!=='1a738b62e3d7b2d67f1e234d06f8a0dcc7954adf0286d270e35f9c7b1971a863')throw Error('Unexpected published FBO service; review new baseline first');
function replace(a,b){if(s.split(a).length!==2)throw Error('Expected one anchor: '+a.slice(0,100));s=s.replace(a,b);}
const load='require("./fbo-fbs-reservations").loadFboFbsAvailability';
replace('        const route = [];','        const route = [];\n        const availability = await '+load+'(tx, r, Object.keys(demand));');
replace('const quantity = Math.min(demand[l.skuId], balance.quantity);',
  'const quantity = Math.min(demand[l.skuId], balance.quantity, availability.free(box.id, l.skuId));\n                if (!quantity) continue;\n                availability.take(box.id, l.skuId, quantity);');
replace('                    const holding = whole ? source :',
  '                    // FIX: protect FBS before stock debit, including whole-box scans.\n                    const availability = await '+load+'(tx, r, [...new Set(chosen.map(p => p.skuId))]);\n                    for (const pick of chosen) availability.take(source.id, pick.skuId, 1);\n                    const holding = whole ? source :');
replace('        const movement = await this.move(tx, r, sku.id, source.id, target.id, existing ?',
  '        // FIX: manual packaging cannot bypass the FBS reserve.\n        if (!existing) (await '+load+'(tx, r, [sku.id])).take(source.id, sku.id, 1);\n        const movement = await this.move(tx, r, sku.id, source.id, target.id, existing ?');
replace('        // FIX: retain completed shipment evidence, but invalidate unfinished physical ownership.',
  '        // FIX: a physical recovery must never release an active FBS assignment.\n        if (oldTasks.some(t => !["COMPLETED", "RELEASED", "CANCELLED"].includes(t.status)))\n            throw new common_1.ConflictException("КИЗ закреплён за активной сборкой FBS. Завершите или отмените её перед отбором в ФБО.");\n        // FIX: retain completed shipment evidence, but invalidate unfinished physical ownership.');
replace('            if (source) {\n                const changed = await tx.stockBalance.updateMany',
  '            if (source) {\n                if (source.status === "AVAILABLE" && source.boxId !== boxId)\n                    (await '+load+'(tx, r, [skuId])).take(source.boxId, skuId, 1);\n                const changed = await tx.stockBalance.updateMany');
replace('                    await this.releaseDisplacedRoutes(tx, source.id, source.code, [...new Set(chosen.map(p => p.skuId))]);','');
replace('            await this.releaseDisplacedRoutes(tx, source.id, source.code, [sku.id]);','');
replace("            if (source?.status === 'AVAILABLE' && oldBox && oldBox.id !== boxId)\n                await this.releaseDisplacedRoutes(tx, oldBox.id, oldBox.code, [skuId]);",'');
const start=s.indexOf('    async releaseDisplacedRoutes('),end=s.indexOf('    async bindPickedMark(',start);
if(start<0||end<start)throw Error('Missing legacy displacement helper');
s=s.slice(0,start)+s.slice(end);
const helper=ts.transpileModule(fs.readFileSync(path.join(root,'apps/api/src/modules/tsd/fbo-fbs-reservations.ts'),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
fs.writeFileSync(file,s);
fs.writeFileSync(path.join(target,'modules/tsd/fbo-fbs-reservations.js'),helper);
console.log('Patched two API files; no other runtime changes.');
