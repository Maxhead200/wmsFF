const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(process.argv[2]);
const user={id:'receipt-fixture',roleCodes:['OWNER'],permissionCodes:['warehouse:read','warehouse:write'],clientScopeMode:'ALL',clientIds:[],writableClientIds:[],warehouseIds:['w'],activeWarehouseId:'w'};
// TEST: execute the actual versioned production module, including its original React runtime.
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],posts=[];
 page.on('pageerror',e=>errors.push(e.message));
 let fbs=true,revision=0;
 await page.route('https://wms.logoff.pro/**',async r=>{
  const n=new URL(r.request().url()).pathname.slice(1)||'index.html';
  if(n.startsWith('api/v1/')){
   let data=[];if(n.endsWith('auth/me'))data=user;
   if(n.includes('receipt-channels')){
    if(r.request().method()==='GET')data={enabled:true,rows:[{id:'a'.repeat(32),sourceDocument:'SERIES:2026:FFL_LKB2409',date:'2026-09-24T00:00:00Z',received:25,current:true,boxes:[{code:'FFL_LKB2409_1'}],fbs,fbo:true,revision}]};
    else {const body=r.request().postDataJSON();posts.push({n,body});
     if(n.endsWith('/preview'))data={available:25,protectedQuantity:1,excludedQuantity:24};
     else if(n.endsWith('/assign-box'))data={series:'SERIES:2026:FFL_LKB2409',fbs,fbo:true};
     else {fbs=body.fbs;revision++;data={};}
    }
   }
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }
  if(n==='fixture')return r.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
  const file=[path.join(root,'web',n),path.join(root,'before-web',n)].find(fs.existsSync);if(!file)return r.abort();
  let body=fs.readFileSync(file);if(n==='assets/receipt-channels-20260930-0.js')body=Buffer.concat([body,Buffer.from('\nexport {x as TestReact,ws as TestDom,__ReceiptDirections as TestDirections};')]);
  return r.fulfill({contentType:n.endsWith('.js')?'application/javascript':n.endsWith('.css')?'text/css':'text/html',body});
 });
 await page.goto('https://wms.logoff.pro/fixture');
 await page.evaluate(async u=>{const m=await import('/assets/receipt-channels-20260930-0.js');window.fixture=m;window.fixtureRoot=m.TestDom.createRoot(document.getElementById('root'));window.fixtureRoot.render(m.TestReact.createElement(m.TestDirections.ReceiptDirectionsPanel,{session:{accessToken:'fixture',user:u},fixedClientId:'client'}));},user);
 await page.getByRole('checkbox',{name:'FBS SERIES:2026:FFL_LKB2409',exact:true}).waitFor();
 await page.getByRole('checkbox',{name:'FBS SERIES:2026:FFL_LKB2409',exact:true}).click();
 await page.getByRole('region',{name:'Проверка направлений'}).waitFor();assert.equal(fbs,true);assert.equal(posts.length,1);
 assert((await page.getByRole('region',{name:'Проверка направлений'}).innerText()).includes('24 шт.'));
 await page.getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(fbs,true);
 await page.getByRole('checkbox',{name:'FBS SERIES:2026:FFL_LKB2409',exact:true}).click();
 await page.getByRole('button',{name:'Сохранить направления',exact:true}).click();
 await page.getByText('Направления приёмки сохранены.',{exact:false}).waitFor();assert.equal(fbs,false);assert.equal(revision,1);
 await page.getByRole('button',{name:'Добавить ошибочно названный короб'}).click();
 await page.getByLabel('Номер короба',{exact:true}).fill('FFL_LKBFBO2409_250');await page.getByRole('button',{name:'Проверить короб',exact:true}).click();
 await page.getByRole('button',{name:'Подтвердить привязку',exact:true}).click();await page.getByText('Короб отнесён',{exact:false}).waitFor();
 assert(posts.some(p=>p.body.save===true&&p.body.boxCode==='FFL_LKBFBO2409_250'));
 await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('checkbox').count(),2);
 await page.screenshot({path:path.join(root,'receipt-mobile.png'),fullPage:true});
 await page.evaluate(u=>{const m=window.fixture;window.fixtureRoot.render(m.TestReact.createElement(m.TestDirections.ReceiptDirectionsPanel,{session:{accessToken:'fixture',user:{...u,roleCodes:['PICKER']}},fixedClientId:'client'}));},user);
 await page.waitForTimeout(100);assert.equal(await page.locator('.receipt-directions').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: actual runtime preview/cancel/save/manual membership/mobile/role isolation');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
