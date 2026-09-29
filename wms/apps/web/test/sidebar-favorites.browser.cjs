const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'..'),req=createRequire(path.join(web,'package.json')),vite=createRequire(req.resolve('vite/package.json'));
const {chromium}=require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: favorites copy authorized routes without moving originals, survive remount and isolate users.
(async()=>{
 const runtime=process.env.NAV_RUNTIME;
 const navigation=runtime?`const PantheraNavigation=new Function('__WmsReact',${JSON.stringify(fs.readFileSync(runtime,'utf8').split('const __WmsReact=x;')[1].replace('__MainFeatures.installNetworkLoading();','')+';return __MainFeatures.PantheraNavigation;')})(React);`:"import{PantheraNavigation}from'./src/components/layout/PantheraNavigation';";
 const build=await vite('esbuild').build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';${navigation}const root=createRoot(document.getElementById('root'));const icon=()=>null;const groups=[{id:'main',title:'Главное',items:[{id:'overview',title:'Обзор',icon}]},{id:'operations',title:'Операции',items:[{id:'requests',title:'Заявки',icon},{id:'inventory',title:'Инвентаризация',icon}]}];function Demo(props){const[active,setActive]=React.useState("overview");return <PantheraNavigation {...props} activeId={active} onOpen={id=>{window.opened=id;setActive(id);}}/>;}window.render=(user='one',key='a',allowed=groups)=>root.render(<Demo key={key} groups={allowed} userId={user} kizUnread={0}/>);window.render();`,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.route('http://favorites.test/',r=>r.fulfill({contentType:'text/html',body:'<nav id="root"></nav>'}));await page.goto('http://favorites.test/');await page.addScriptTag({content:build.outputFiles[0].text});
  const quick=page.getByRole('region',{name:'Часто используемые'});
  await page.getByRole('button',{name:'Добавить быструю ссылку'}).click();await page.getByRole('button',{name:'+ Заявки',exact:true}).click();await page.getByRole('button',{name:'+ Инвентаризация',exact:true}).click();await page.getByRole('button',{name:'Готово',exact:true}).click();
  assert.equal(await quick.locator('.workspace-favorites__item').count(),2);assert.equal(await page.locator('details > button').count(),2);
  await quick.getByRole('button',{name:'Заявки',exact:true}).click();assert.equal(await page.evaluate(()=>window.opened),'requests');
  // TEST: quick navigation must not expand its original group.
  assert.equal(await page.locator('details').evaluate(e=>e.open),false);
  await page.getByRole('button',{name:'Редактировать быстрые ссылки',exact:true}).click();
  await quick.getByLabel('Перетащить: Инвентаризация',{exact:true}).dragTo(quick.locator('.workspace-favorites__item').first());
  assert.deepEqual(await quick.locator('.workspace-favorites__item > button:first-of-type span').allTextContents(),['Инвентаризация','Заявки']);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wms.panthera.favorites.one'))),['inventory','requests']);
  await quick.getByLabel('Перетащить: Инвентаризация',{exact:true}).dragTo(quick.locator('.workspace-favorites__item').last());
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wms.panthera.favorites.one'))),['requests','inventory']);
  await quick.getByRole('button',{name:'Выше: Инвентаризация',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wms.panthera.favorites.one'))),['inventory','requests']);
  await page.getByRole('button',{name:'Завершить редактирование быстрых ссылок',exact:true}).click();
  await page.evaluate(()=>window.render('one','b'));await page.waitForFunction(()=>document.querySelectorAll('.workspace-favorites__item').length===2);
  assert.deepEqual(await quick.locator('.workspace-favorites__item > button:first-of-type span').allTextContents(),['Инвентаризация','Заявки']);
  await quick.click({button:'right'});await quick.getByRole('button',{name:'Убрать быструю ссылку: Заявки',exact:true}).click();assert.equal(await quick.locator('.workspace-favorites__item').count(),1);assert.equal(await page.locator('details > button').count(),2);
  assert.equal(await quick.locator('.workspace-favorites__heading svg').count(),1);
  await page.evaluate(()=>window.render('two','c'));await page.waitForFunction(()=>document.querySelectorAll('.workspace-favorites__item').length===0);
  console.log('PASS: favorites add/open/remove, original groups retained, persisted choices, per-user isolation and gear');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
