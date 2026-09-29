const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.RUNTIME_BASE||'D:/WMSFF/_Kof/work/request-batch-release/web',candidate=process.env.RUNTIME_CANDIDATE||'D:/WMSFF/_Kof/work/request-batch-release/candidate-assets-v2';
const proof=JSON.parse(fs.readFileSync(path.join(candidate,'proof.json')));
// TEST: mount the actual candidate request panel and adapters with local API fixtures, never production mutations.
(async()=>{
 const errors=[],calls=[];
 const requests=['one','two'].map((id,i)=>({id,number:i+1,type:'OUTBOUND',status:i?'SUBMITTED':'IN_WORK',priority:'NORMAL',title:'FBS — '+id,clientId:'client',client:{id:'client',name:'Тестовый клиент',code:'CL-1'},items:[{id:id+'-item',quantity:1,requestedName:'Товар'}],packages:[],files:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),_count:{fbsOrderLinks:1}}));
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local');let file=url.pathname==='/'?'index.html':url.pathname.slice(1);let p=path.join(base,file);
  if(file==='index.html')p=path.join(candidate,file);else if(file.startsWith('assets/')&&fs.existsSync(path.join(candidate,file.slice(7))))p=path.join(candidate,file.slice(7));
  if(!fs.existsSync(p)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html');let content=fs.readFileSync(p);
  if(file==='assets/'+proof.entry)content=Buffer.concat([content,Buffer.from(';window.__mainProof={React:x,createRoot:iT.createRoot,features:__MainFeatures};')]);
  if(file==='assets/'+proof.requests)content=Buffer.concat([content,Buffer.from(';window.__requestProof={Panel:xr,Table:ui,OrderAge:WmsOrderAge214,features:__BatchFeatures};')]);res.end(content);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',async route=>{
   const req=route.request(),url=new URL(req.url());calls.push({path:url.pathname,search:url.search,method:req.method(),body:req.postDataJSON()});
   let body=[];let status=200;
   if(url.pathname.endsWith('/client-requests'))body=requests;
   else if(url.pathname.endsWith('/clients'))body=[requests[0].client];
   else if(url.pathname.endsWith('/manual-box-selection')){const id=url.pathname.split('/').at(-2);body={items:[{requestItemId:id+'-item',requestedQuantity:1,selectedQuantity:0,boxes:id==='one'?[]:[{boxCode:'KNOWN',availableQuantity:5}],fbsOrders:id==='one'?[{boxCode:'БЕЗ КОРОБА'}]:[]}]};}
   else if(url.pathname.endsWith('/status')&&req.method()==='PATCH'){const id=url.pathname.split('/').at(-2);if(id==='two'){status=400;body={message:'Проверка КИЗ'};}else{requests[0].status='DONE';body=requests[0];}}
   else if(url.pathname.endsWith('/fbs/orders'))body={orders:requests.map((r,i)=>({id:'order-'+r.id,connectionId:'wb',request:{id:r.id},category:'shipped',createdAt:new Date(Date.now()-(i?20:1)*3600000).toISOString()}))};
   else if(url.pathname.endsWith('/slow-fixture')){await new Promise(r=>setTimeout(r,350));body={ok:true};}
   else if(url.pathname.endsWith('/box-overlaps'))body={requests:[],boxes:[],summary:{}};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__mainProof);await page.evaluate(async name=>{await import('/assets/'+name);document.documentElement.dataset.uiTheme='modern';document.documentElement.dataset.uiVariant='la_panthera';document.getElementById('root').style.display='none';const host=document.createElement('div');host.id='fixture';host.className='workspace-content';document.body.append(host);const {React,createRoot}=window.__mainProof;window.fixtureRoot=createRoot(host);window.fixtureRoot.render(React.createElement(window.__requestProof.Panel,{session:{accessToken:'fixture-only',user:{id:'fixture',name:'Тест',roleCodes:[],permissionCodes:['client-requests:read','client-requests:write','client-requests:status'],clientScopeMode:'ALL',writableClientIds:['client'],activeWarehouseId:null}}}));},proof.requests);
  await page.getByRole('checkbox',{name:'Выбрать несколько заявок для сдачи'}).waitFor();
  // TEST: terminal requests are hidden from the active list and retained in the archive.
  requests.push({...requests[0],id:'rejected',number:99901,status:'REJECTED'},{...requests[0],id:'cancelled',number:99902,status:'CANCELLED'});
  await page.locator('.client-request-archive-toggle').click();
  await page.getByText('99901',{exact:true}).waitFor();await page.getByText('99902',{exact:true}).waitFor();
  await page.locator('.client-request-archive-toggle').click();
  await page.waitForFunction(()=>!document.querySelector('#fixture').textContent.includes('99901'));
  assert.equal(await page.getByText('99902',{exact:true}).count(),0);
  const badgeHtml=await page.evaluate(()=>{const host=document.createElement('div');host.id='status-fixture';document.body.append(host);window.__mainProof.createRoot(host).render(window.__mainProof.React.createElement(window.__requestProof.features.WbStatusBadge,{status:'complete/sorted'}));});
  await page.getByText('Статус WB: Отсортировано',{exact:true}).waitFor();
  // TEST: online timers are outside request rows and need their own age colours.
  await page.evaluate(()=>{const {React,createRoot}=window.__mainProof;for(const hours of [1,15,20]){const host=document.createElement('div');host.id='age-'+hours;document.body.append(host);createRoot(host).render(React.createElement(window.__requestProof.OrderAge,{createdAt:new Date(Date.now()-hours*3600000).toISOString()}));}});
  for(const [hours,tone,color] of [[1,'normal','rgb(147, 201, 172)'],[15,'warning','rgb(223, 194, 129)'],[20,'critical','rgb(231, 157, 159)']]){await page.locator(`#age-${hours} [data-age-zone="${tone}"]`).waitFor();assert.equal(await page.locator(`#age-${hours} small`).evaluate(e=>getComputedStyle(e).color),color);}

  assert.equal(await page.locator('.wb-status-badge').getAttribute('title'),'complete/sorted');

  await page.addStyleTag({url:'/assets/ClientRequestsPanel-DSREBZ1c.css'});const excel=page.locator('details.client-request-excel-collapse');// TEST: the entire creation area collapses in every theme, retaining entered values.
  for(const theme of ['classic','spirit','la_panthera']) {
    await page.evaluate(theme=>document.documentElement.dataset.uiVariant=theme,theme);
    assert.equal(await excel.getAttribute('open'),null);
    const branch=page.getByText('Филиал исполнения',{exact:true});
    assert.equal(await branch.isVisible(),false,'Manual creation must collapse with Excel');
    assert.equal(await page.getByText('Состав заявки',{exact:true}).isVisible(),false);
    await excel.locator('summary').click();assert.equal(await branch.isVisible(),true);
    const comment=excel.locator('textarea').first();await comment.fill('Сохранённый черновик');
    await excel.locator('summary').click();assert.equal(await branch.isVisible(),false);
    await excel.locator('summary').click();assert.equal(await comment.inputValue(),'Сохранённый черновик');
    await excel.locator('summary').click();
  }
  await page.getByRole('combobox',{name:'Поле сортировки'}).selectOption('status');await page.getByRole('combobox',{name:'Направление сортировки'}).selectOption('asc');
  await page.getByRole('combobox',{name:'Статус заявки',exact:true}).selectOption('IN_WORK');assert.equal(await page.locator('.client-request-row').count(),1);await page.getByRole('combobox',{name:'Статус заявки',exact:true}).selectOption('');
  await page.waitForFunction(()=>document.querySelector('.client-request-row[data-request-zone="critical"]'));
  assert.equal(await page.locator('.client-request-row').first().getAttribute('data-request-zone'),'critical');assert.equal(await page.locator('.client-request-row').first().locator('.client-request-number__accent').evaluate(e=>getComputedStyle(e).color),'rgb(231, 157, 159)');await page.locator('#fixture').screenshot({path:path.join(candidate,'request-panel.png')});
  await page.getByRole('checkbox',{name:'Выбрать несколько заявок для сдачи'}).check();await page.getByRole('checkbox',{name:'Выбрать все доступные заявки на экране'}).check();await page.getByRole('button',{name:'Перевести выбранные в «Сдано»'}).click();await page.getByRole('button',{name:'Подтвердить сдачу',exact:true}).click();await page.getByRole('status').filter({hasText:'Сдано: 1.'}).waitFor();
  const mutations=calls.filter(c=>c.method==='PATCH');assert.equal(mutations.length,2);assert.deepEqual(mutations.find(c=>c.path.includes('/one/')).body.stockSources,[{requestItemId:'one-item',noBox:true,quantity:1}]);assert.deepEqual(mutations.find(c=>c.path.includes('/two/')).body.stockSources,[{requestItemId:'two-item',boxCode:'KNOWN',quantity:1,requireAvailableStock:true}]);
  await page.evaluate(()=>{window.loadingFixture=fetch('/api/v1/slow-fixture').then(r=>r.json());});assert.equal(await page.locator('html').getAttribute('data-network-loading'),'');assert.match(await page.evaluate(()=>getComputedStyle(document.body,'::after').backgroundImage),/panther-original\.gif/);await page.evaluate(()=>window.loadingFixture);await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-network-loading'));
  assert.equal(calls.some(c=>c.path.endsWith('/fbs/orders')&&c.search.includes('refresh=1')),false);assert(calls.filter(c=>c.path.endsWith('/fbs/orders')).every(c=>c.search.includes('view=snapshot')));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(candidate,'browser-proof.json'),JSON.stringify({passed:true,checks:['actual request panel','collapsed Excel','status sorting','majority zone','bulk selection','known box preserved','partial results','network loader'],errors}));
  console.log('PASS: actual candidate runtime, status sort, collapsed Excel, bulk DONE, known-box guard, majority colour and network loader');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
