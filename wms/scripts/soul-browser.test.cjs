// TEST: real Soul component, isolated browser; no production API calls.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(path.join(web,'package.json')),rv=createRequire(rw.resolve('vite/package.json'));
test('Soul navigation preserves page state and fits desktop, tablet and phone',async()=>{
 const {chromium}=require(process.env.WMS_TEST_PLAYWRIGHT);
 const code=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{SoulWorkspace}from'./src/components/layout/SoulWorkspace';
 const groups=['client','operations','management','control'].map((id,n)=>({id,title:['Клиентский контур','Склад и операции','Управление','Контроль'][n],items:[{id:id+'1',title:'Длинное название рабочего раздела '+n},{id:id+'2',title:'Другой раздел '+n}]}));
 function App(){const[id,set]=useState('overview');return <div className="app-layout" data-ui-theme="modern"><section className="workspace-content"><SoulWorkspace groups={groups} activeId={id} onOpen={set}><input aria-label="Несохранённое поле"/><div className="table-wrap"><table style={{width:1600}}><tbody><tr><td>Настоящая страница</td></tr></tbody></table></div></SoulWorkspace></section></div>};createRoot(document.getElementById('root')).render(<App/>);`;
 const built=await rv('esbuild').build({stdin:{contents:code,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'transform'});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [1440,1024,390]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html data-ui-variant="soul"><head><style>body{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({content:fs.readFileSync(path.join(web,'src/components/layout/soul-theme.css'),'utf8')});await page.addScriptTag({content:built.outputFiles[0].text});
  await page.locator('[data-soul-open="client1"]').waitFor();assert.equal(await page.locator('[data-soul-open]').count(),8);
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('data-soul-open'),'client1');await page.keyboard.press('Enter');
  await page.getByLabel('Несохранённое поле').fill('сохранить');await page.locator('[data-soul-group="operations"]').click();
  assert.equal(await page.getByLabel('Несохранённое поле').inputValue(),'сохранить');assert.equal(await page.locator('[data-soul-page]').getAttribute('data-soul-page'),'client1');
  await page.locator('[data-soul-open="operations2"]').click();assert.equal(await page.locator('[aria-current="page"]').getAttribute('data-soul-open'),'operations2');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('.soul-page').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.getByRole('button',{name:'← Все разделы'}).click();assert.equal(await page.locator('[data-soul-open]').count(),8);assert.equal(await page.locator('[data-soul-page]').count(),0);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
