const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{chromium}=require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: actual runtime CSS, distinct matching timer/button colors and isolated themes/print.
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:900,height:500}}),root=process.env.RUNTIME_BASE;assert.ok(root);
 await page.setContent(`<html data-ui-theme="modern" data-ui-variant="la_panthera"><body style="padding:24px;font-family:Arial"><main class="app-layout" data-ui-theme="modern" style="display:block"><section class="fbs-panel"><div class="fbs-order-actions"><div class="fbs-order-actions__age-zones"><span>Выбрать всю зону:</span>${['green','yellow','red'].map((z,i)=>`<button class="is-${z}">${['Зелёная · 65','Жёлтая · 88','Красная · 21'][i]}</button>`).join('')}</div><button id="next">Выбрать следующие 28</button></div><div style="display:flex;gap:20px;margin-top:30px">${['normal','warning','critical','finished'].map((z,i)=>`<span class="fbs-order-age fbs-order-age--${z}">Прошло ${[1,15,20,24][i]} ч</span>`).join('')}</div></section></main></body></html>`);
 for(const m of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/href="(\/assets\/[^" ]+\.css)"/g))await page.addStyleTag({path:path.join(root,m[1])});
 for(const name of fs.readdirSync(path.join(root,'assets')).filter(n=>/^fbs-[A-Za-z0-9_]+\.css$/.test(n)))await page.addStyleTag({path:path.join(root,'assets',name)});
 const style=selector=>page.locator(selector).evaluate(e=>{const s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,border:s.borderTopColor};});
 const old={};for(const v of ['classic','spirit']){await page.evaluate(v=>document.documentElement.dataset.uiVariant=v,v);old[v]=await style('.is-yellow');}
 await page.evaluate(()=>document.documentElement.dataset.uiVariant='la_panthera');await page.emulateMedia({media:'print'});old.print=await style('.is-yellow');await page.emulateMedia({media:'screen'});old.finished=await style('.fbs-order-age--finished');old.next=await style('#next');
 if(process.env.APPLY_FIX==='1')await page.addStyleTag({path:path.resolve(__dirname,'../src/components/layout/la-panthera-theme.css')});
 const rows=[['green','normal','rgb(147, 201, 172)'],['yellow','warning','rgb(223, 194, 129)'],['red','critical','rgb(231, 157, 159)']];
 for(const [zone,tone,color]of rows){const a=await style('.is-'+zone),b=await style('.fbs-order-age--'+tone);assert.equal(a.color,color);assert.deepEqual(a,b);await page.locator('.is-'+zone).hover();assert.equal((await style('.is-'+zone)).color,color);await page.mouse.move(850,450);}
 assert.deepEqual(await style('.fbs-order-age--finished'),old.finished);assert.deepEqual(await style('#next'),old.next);
 if(process.env.SCREENSHOT)await page.screenshot({path:process.env.SCREENSHOT});
 for(const v of ['classic','spirit']){await page.evaluate(v=>document.documentElement.dataset.uiVariant=v,v);assert.deepEqual(await style('.is-yellow'),old[v]);}
 await page.evaluate(()=>document.documentElement.dataset.uiVariant='la_panthera');await page.emulateMedia({media:'print'});assert.deepEqual(await style('.is-yellow'),old.print);
 console.log('PASS: all three zones, timer parity, hover, unrelated controls and theme/print isolation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
