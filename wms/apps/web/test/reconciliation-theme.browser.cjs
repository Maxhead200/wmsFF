const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: reconciliation surfaces stay readable; other themes and print remain unchanged.
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1400,height:800}});
 const base=process.env.RUNTIME_BASE;assert.ok(base);
 await page.setContent(`<html data-ui-theme="modern" data-ui-variant="la_panthera"><body><main class="app-layout" data-ui-theme="modern" style="display:block;padding:20px;font-family:Arial,sans-serif"><section class="billing-reconciliation"><div class="billing-reconciliation__heading"><div><h3>Задолженность и сверка</h3><span>Обновлено 29.09.2026, 09:59</span></div></div><div class="billing-reconciliation__metrics">${['Выставлено','Оплачено','Аванс','К оплате','Просрочено'].map(t=>`<article class="billing-reconciliation-metric"><div><span>${t}</span><strong>0,00 ₽</strong></div></article>`).join('')}</div><p class="panel-message">Открытой задолженности по выбранным условиям нет.</p><div class="billing-reconciliation__clients"><article class="billing-reconciliation-client"><div class="billing-reconciliation-client__summary"><div><strong>Клиент</strong><span>Открытый счёт</span></div></div><div class="billing-reconciliation-invoice"><strong>1 000,00 ₽</strong></div></article></div></section></main></body></html>`);
 for(const match of fs.readFileSync(path.join(base,'index.html'),'utf8').matchAll(/href="(\/assets\/[^" ]+\.css)"/g))await page.addStyleTag({path:path.join(base,match[1])});
 const read=()=>page.locator('.billing-reconciliation').evaluate(e=>{const c=getComputedStyle(e);return {background:c.backgroundColor,border:c.borderTopColor,shadow:c.boxShadow};});
 const others={};for(const theme of ['classic','spirit']){await page.evaluate(t=>document.documentElement.dataset.uiVariant=t,theme);others[theme]=await read();}
 await page.evaluate(()=>document.documentElement.dataset.uiVariant='la_panthera');await page.emulateMedia({media:'print'});const print=await read();await page.emulateMedia({media:'screen'});
 if(process.env.APPLY_FIX==='1')await page.addStyleTag({path:path.resolve(__dirname,'../src/components/layout/la-panthera-theme.css')});
 const style=await read();assert.equal(style.background,'rgb(25, 26, 30)');assert.notEqual(style.shadow,'none');
 assert.equal(await page.locator('h3').evaluate(e=>getComputedStyle(e).color),'rgb(159, 215, 209)');
 assert.equal(await page.locator('.billing-reconciliation__heading span').evaluate(e=>getComputedStyle(e).color),'rgb(180, 186, 199)');
 if(process.env.SCREENSHOT)await page.screenshot({path:process.env.SCREENSHOT});
 for(const theme of ['classic','spirit']){await page.evaluate(t=>document.documentElement.dataset.uiVariant=t,theme);assert.deepEqual(await read(),others[theme]);}
 await page.evaluate(()=>document.documentElement.dataset.uiVariant='la_panthera');await page.emulateMedia({media:'print'});assert.deepEqual(await read(),print);
 console.log('PASS: reconciliation dark surface, heading, populated state, theme and print isolation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
