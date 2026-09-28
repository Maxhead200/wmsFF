// TEST: isolated browser, no user session, no external requests, three viewport sizes.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('./server.cjs');const {menu}=require('./model.cjs');
test('Soul navigation, all pages, responsive layout and reduced motion',async()=>{
 const {chromium}=require(process.env.WMS_TEST_PLAYWRIGHT||'playwright');
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [1440,1024,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base);
 assert.equal(await page.locator('.group').count(),4);assert.equal(await page.locator('[data-open]').count(),36);
 assert.equal(await page.locator('#navigation').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),width===1440?4:width===1024?2:1);
 await page.locator('[data-open="fbs"]').click();assert.equal(await page.locator('#page').getAttribute('data-selected'),'fbs');
 assert.equal(await page.locator('[aria-current="page"]').count(),1);
 await page.locator('[data-group="management"]').click();assert.equal(await page.locator('#page').getAttribute('data-selected'),'fbs');
 await page.locator('[data-open="billing"]').click();assert.equal(await page.locator('#page').getAttribute('data-selected'),'billing');
 await page.locator('#search').fill('несуществующий');assert.match(await page.locator('tbody').innerText(),/ничего не найдено/);
 await page.locator('#home').click();assert.equal(await page.locator('.group').count(),4);assert.equal(await page.locator('#page').isVisible(),false);
 await page.locator('[data-open="operations-statistics"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#page').getAttribute('data-selected'),'operations-statistics');
 for(const g of menu){for(const item of g.items){await page.locator(`[data-group="${g.id}"]`).click();await page.locator(`[data-open="${item.id}"]`).click();assert.equal(await page.locator('#page h2').innerText(),item.title);assert.match(await page.locator('#page').innerText(),/Демонстрационные данные/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}}
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#page').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.locator('#home').click();await page.keyboard.press('Tab');await page.locator('[data-open="fbs"]').focus();assert.notEqual(await page.locator('[data-open="fbs"]').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 // TEST: actual rendered text/icon colours against their opaque ancestor surface.
 const failures=await page.evaluate(()=>{
 const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};
 return [...document.querySelectorAll('h1,h2,.item span,.group-description,.group-head small,.demo,.group-footer span')].filter(e=>e.getClientRects().length).map(e=>{let p=e,bg;while(p){bg=getComputedStyle(p).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;p=p.parentElement;}const a=lum(getComputedStyle(e).color),b=lum(bg);return {text:e.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};}).filter(x=>x.ratio<4.5);
 });assert.deepEqual(failures,[]);
 if(process.env.SOUL_SHOTS){await page.screenshot({path:process.env.SOUL_SHOTS+`/soul-home-${width}.png`,fullPage:true});await page.locator('[data-open="fbs"]').click();await page.screenshot({path:process.env.SOUL_SHOTS+`/soul-fbs-${width}.png`,fullPage:true});await page.locator('[data-group="management"]').click();await page.screenshot({path:process.env.SOUL_SHOTS+`/soul-group-${width}.png`,fullPage:true});}
 assert.deepEqual(errors,[]);await page.close();}
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
