const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{chromium}=require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: actual CSS, top-row layout, gold bell, contrast and narrow-screen wrapping.
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{const p=await b.newPage({viewport:{width:1440,height:650}});const root=process.env.RUNTIME_BASE;
await p.setContent(`<html data-ui-theme="modern" data-ui-variant="la_panthera"><body style="padding:20px"><main class="app-layout" data-ui-theme="modern" style="display:block"><div class="header-notification-center"><button class="modern-header-action"><svg><path d="M1 1L10 10"/></svg><span>99+</span></button></div><div class="monitoring-hub"><nav class="monitoring-hub__switcher">${['Синхронизация WB','Мониторинг ТСД','Мониторинг остатков ВБ и WMS'].map(t=>`<button><span><strong>${t}</strong><small>Устройства, сборщики и ошибки сканирования</small></span></button>`).join('')}</nav></div></main></body></html>`);
for(const m of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/href="(\/assets\/[^" ]+\.css)"/g))await p.addStyleTag({path:path.join(root,m[1])});
await p.addStyleTag({path:path.resolve(__dirname,'../src/components/monitoring/stock-monitoring.css')});
if(process.env.APPLY_FIX==='1')await p.addStyleTag({path:path.resolve(__dirname,'../src/components/layout/la-panthera-theme.css')});
const boxes=await p.locator('.monitoring-hub__switcher button').evaluateAll(es=>es.map(e=>({y:e.getBoundingClientRect().y,w:e.getBoundingClientRect().width})));assert.equal(boxes[0].y,boxes[2].y,'All three monitoring cards share the top row');assert.ok(Math.abs(boxes[0].w-boxes[2].w)<2);
assert.equal(await p.locator('.header-notification-center svg').evaluate(e=>getComputedStyle(e).color),'rgb(226, 186, 98)');
assert.equal(await p.locator('.header-notification-center button>span').evaluate(e=>getComputedStyle(e).color),'rgb(32, 25, 16)');
await p.setViewportSize({width:390,height:850});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
if(process.env.SCREENSHOT)await p.screenshot({path:process.env.SCREENSHOT});console.log('PASS monitoring top row, golden bell, badge and responsive layout');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
