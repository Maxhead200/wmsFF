// TEST: production Soul component, user isolation, persistence and mobile quick tiles.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'../apps/web'),rw=createRequire(path.join(web,'package.json')),rv=createRequire(rw.resolve('vite/package.json'));
test('personal quick access tracks real openings without duplicate counts or lost permissions',async()=>{
 const code=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{SoulWorkspace}from'./src/components/layout/SoulWorkspace';
 function App(){const[id,set]=useState('overview'),[user,U]=useState('alice'),[allowed,A]=useState(true);const groups=[{id:'client',title:'Клиентский контур',items:[{id:'cabinet',title:'Кабинет'},...(allowed?[{id:'fbs',title:'FBS'}]:[])]}];return <><button id="user" onClick={()=>{U(user==='alice'?'bob':'alice');set('overview')}}>user</button><button id="permission" onClick={()=>A(false)}>permission</button><button id="external" onClick={()=>set('fbs')}>search</button><div className="app-layout" data-ui-theme="modern"><section className="workspace-content"><SoulWorkspace groups={groups} userId={user} activeId={id} onOpen={set}><p>page</p></SoulWorkspace></section></div></>};createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
 const js=(await rv('esbuild').build({stdin:{contents:code,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'transform'})).outputFiles[0].text;
 const {chromium}=require(process.env.WMS_TEST_PLAYWRIGHT),browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [1440,1024,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://quick.test/**',r=>r.fulfill({contentType:'text/html',body:'<html data-ui-variant="soul"><head><style>*{box-sizing:border-box}body{margin:0}</style></head><body><div id="root"></div></body></html>'}));
  const mount=async()=>{await page.goto('http://quick.test');await page.addStyleTag({content:fs.readFileSync(path.join(web,'src/components/layout/soul-theme.css'),'utf8')});await page.addScriptTag({content:js});await page.locator('.soul-quick-access').waitFor();};
  const home=()=>page.getByRole('button',{name:'← Все разделы'}).click();
  await mount();assert.equal(await page.locator('[data-soul-quick]').count(),0);
  await page.locator('[data-soul-open="cabinet"]').click();await home();
  await page.locator('#external').click();await home();
  await page.locator('[data-soul-quick="fbs"]').click();await home();
  assert.equal(await page.locator('[data-soul-quick]').first().getAttribute('data-soul-quick'),'fbs');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wms.soul.quick.v1:alice')).fbs.count),2);
  const box=await page.locator('[data-soul-quick="fbs"]').boundingBox();assert.equal(box.width,114);assert.equal(box.height,57);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const positions=await page.evaluate(()=>['.soul-toolbar','.soul-quick-access','.soul-home-grid'].map(s=>{const b=document.querySelector(s).getBoundingClientRect();return{top:b.top,bottom:b.bottom}}));assert.ok(positions[1].top>=positions[0].bottom&&positions[2].top>=positions[1].bottom);
  await mount();assert.equal(await page.locator('[data-soul-quick]').count(),2);
  await page.locator('#user').click();assert.equal(await page.locator('[data-soul-quick]').count(),0);
  await page.locator('#user').click();assert.equal(await page.locator('[data-soul-quick]').count(),2);
  await page.locator('#permission').click();assert.equal(await page.locator('[data-soul-quick="fbs"]').count(),0);
  await page.locator('[data-soul-quick="cabinet"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-soul-page]').getAttribute('data-soul-page'),'cabinet');await home();
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('blocked')}});
  await page.locator('[data-soul-quick="cabinet"]').click();await home();assert.deepEqual(errors,[]);
  await page.close();
 }}finally{await browser.close();}
});
