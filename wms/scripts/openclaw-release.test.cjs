// TEST: preserve published business code while replacing only AI entry points.
const test=require('node:test'),assert=require('node:assert/strict');
const {patchEntry,patchAdmin,patchApiRuntime,rewriteReferences}=require('./openclaw-release.cjs');
const entry='const x={},e={};function AI({session:t}){return e.jsx("div",{className:"wms-ai-hero"})}function business(){return 42}export{x as r,e as j};';
test('entry wrapper retains legacy and unrelated runtime',()=>{let o=patchEntry(entry,'var __wmsOpenClaw={};');assert.ok(o.includes('function business(){return 42}'));assert.ok(o.includes('function __wmsLegacyAI('));assert.ok(o.includes('__wmsOpenClaw.Replacement'));assert.throws(()=>patchEntry(entry+entry,''));});
test('admin injects session only into assistant call and keeps other tabs',()=>{let s='function Panel({session:s}){return e.jsx(Help,{overview:v,prompt:p})}function Help({overview:v,prompt:p}){return "Помощник не исполняет произвольный код на production."}function other(){return 9}';let o=patchAdmin(s,'entry.js');assert.ok(o.includes('session:s,overview:v'));assert.ok(o.includes('function other(){return 9}'));assert.ok(o.includes('__wmsLegacyAdminAI'));assert.throws(()=>patchAdmin(s.replace('session:s','session:unknown'),'entry.js'));});
test('runtime registry preserves newer attendance and product routes',()=>{let s='exports.INTERNAL_API_DEFINITIONS=Object.freeze([{id:"attendance",routeCount:13},{id:"wms-ai",routeCount:3,description:"old",logic:[]},{id:"clients",routeCount:10}]);';let o=patchApiRuntime('registry',s);assert.ok(o.includes('id:"attendance",routeCount:13'));assert.ok(o.includes('id:"clients",routeCount:10'));assert.ok(/routeCount:\s*6/.test(o));});
test('reference rewrite is reversible and only matches graph filenames',()=>{let s='import "./one.js";let untouched="other.js";';let o=rewriteReferences(s,{'one.js':'new.js'});assert.equal(rewriteReferences(o,{'new.js':'one.js'}),s);});


