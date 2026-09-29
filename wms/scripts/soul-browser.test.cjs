// TEST: real Soul component, isolated browser; no production API calls.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(path.join(web,'package.json')),rv=createRequire(rw.resolve('vite/package.json'));
test('Soul navigation preserves page state and fits desktop, tablet and phone',async()=>{
 const {chromium}=require(process.env.WMS_TEST_PLAYWRIGHT);
 const code=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{SoulWorkspace}from'./src/components/layout/SoulWorkspace';
 const groups=['client','operations','management','control'].map((id,n)=>({id,title:['Клиентский контур','Склад и операции','Управление','Контроль'][n],items:Array.from({length:n+2},(_,i)=>({id:id+(i+1),title:'Длинное название рабочего раздела '+n+' '+i}))}));
 function App(){const[id,set]=useState('overview');return <div className="app-layout" data-ui-theme="modern"><section className="workspace-content"><SoulWorkspace groups={groups} activeId={id} onOpen={set}><input aria-label="Несохранённое поле"/><div className="table-wrap"><table style={{width:1600}}><tbody><tr><td>Настоящая страница</td></tr></tbody></table></div></SoulWorkspace></section></div>};createRoot(document.getElementById('root')).render(<App/>);`;
 const built=await rv('esbuild').build({stdin:{contents:code,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'transform'});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [1440,1024,390]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://soul.test/**',route=>route.fulfill({contentType:'text/html',body:'<html data-ui-variant="soul"><head><style>body{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div></body></html>'}));await page.goto('http://soul.test/');
  await page.addStyleTag({content:fs.readFileSync(path.join(web,'src/components/layout/soul-theme.css'),'utf8')});await page.addScriptTag({content:built.outputFiles[0].text});
  await page.locator('[data-soul-open="client1"]').waitFor();assert.equal(await page.locator('[data-soul-open]').count(),14);
  assert.equal(await page.locator('h1').textContent(),'WMS LOGOff');
  // TEST: unequal menu lengths still produce equal desktop/tablet card dimensions.
  const boxes=await page.locator('.soul-home-grid>.soul-group').evaluateAll(items=>items.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  assert.ok(Math.max(...boxes.map(b=>b.width))-Math.min(...boxes.map(b=>b.width))<1);
  if(width>650)assert.ok(Math.max(...boxes.map(b=>b.height))-Math.min(...boxes.map(b=>b.height))<1,'equal card heights');
  await page.locator('.soul-appearance summary').click();await page.getByLabel('Цвет темы',{exact:true}).selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-soul-mode'),'dark');
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('wms.soul.appearance.v1:local'))).mode,'dark');
  await page.getByLabel('Цвет темы',{exact:true}).selectOption('custom');await page.getByLabel('Тип фона').selectOption('gradient');
  await page.getByLabel('Первый цвет').fill('#123456');await page.getByLabel('Второй цвет').fill('#abcdef');
  assert.ok(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--soul-background').includes('#abcdef')));
  await page.getByLabel('Тип фона').selectOption('image');
  await page.getByLabel('Загрузить обои').setInputFiles({name:'wall.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO3sAAAAASUVORK5CYII=','base64')});
  await page.locator('.soul-wallpaper-preview').waitFor();assert.ok(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--soul-background').includes('data:image/png')));
  await page.getByLabel('Загрузить обои').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});assert.ok(await page.getByRole('alert').isVisible());
  await page.getByRole('button',{name:'Сбросить оформление'}).click();assert.equal(await page.locator('html').getAttribute('data-soul-mode'),'light');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.soul-appearance').getAttribute('open'),null);
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('data-soul-open'),'client1');await page.keyboard.press('Enter');
  await page.getByLabel('Несохранённое поле').fill('сохранить');await page.locator('[data-soul-group="operations"]').click();
  assert.equal(await page.getByLabel('Несохранённое поле').inputValue(),'сохранить');assert.equal(await page.locator('[data-soul-page]').getAttribute('data-soul-page'),'client1');
  await page.locator('[data-soul-open="operations2"]').click();assert.equal(await page.locator('[aria-current="page"]').getAttribute('data-soul-open'),'operations2');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('.soul-page').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.getByRole('button',{name:'← Все разделы'}).click();assert.equal(await page.locator('[data-soul-open]').count(),14);assert.equal(await page.locator('[data-soul-page]').count(),0);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
