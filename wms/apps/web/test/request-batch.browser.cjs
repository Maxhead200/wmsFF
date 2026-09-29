const assert=require('node:assert/strict'),path=require('node:path'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'..'),req=createRequire(path.join(web,'package.json')),vite=createRequire(req.resolve('vite/package.json'));
const {chromium}=require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: actual table select-all drives the common batch controller in every theme.
(async()=>{
 const build=await vite('esbuild').build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{useRequestBatch}from'./src/components/client-requests/RequestBatchControls';import{ClientRequestsTable}from'./src/components/client-requests/ClientRequestsTable';
 const items=['one','two'].map((id,i)=>({id,number:i+1,type:'OUTBOUND',status:'IN_WORK',priority:'NORMAL',title:id,clientId:'c',client:{id:'c',name:'Клиент',code:'CL-1'},items:[{id:id+'-item',quantity:1}],packages:[],files:[],createdAt:'2026-09-29T00:00:00Z'}));window.calls=[];
 function App(){const batch=useRequestBatch({items,enabled:true,token:'test',fetchSelection:async(token,id)=>({items:[{requestItemId:id+'-item',requestedQuantity:1,selectedQuantity:0,boxes:id==='one'?[]:[{boxCode:'KEEP',availableQuantity:0}],fbsOrders:[]}]}),updateStatus:async(token,id,payload)=>{window.calls.push({id,payload});if(id==='two')throw Error('Проверка КИЗ');return{};},reload:async()=>{}});return <>{batch.controls}<ClientRequestsTable items={items} selectableRequestIds={batch.active?batch.selectable:new Set()} selectedRequestIds={batch.selected} onRequestSelectionChange={batch.setSelected} canChangeStatus={false} canPickOutbound={false} canCancelRequests={false} canEditAnyRequest={false} canRefreshPickInstruction={false}/></>;}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const theme of ['classic','soul','la_panthera']){
   const page=await browser.newPage();await page.setContent(`<html data-ui-variant="${theme}"><body><div id="root"></div></body></html>`);await page.addScriptTag({content:build.outputFiles[0].text});
   await page.getByRole('checkbox',{name:'Выбрать несколько заявок для сдачи'}).check();await page.getByRole('checkbox',{name:'Выбрать все доступные заявки на экране'}).check();await page.getByRole('button',{name:'Перевести выбранные в «Сдано»'}).click();await page.getByRole('button',{name:'Подтвердить сдачу',exact:true}).click();await page.getByRole('status').waitFor();
   assert.match(await page.getByRole('status').innerText(),/Сдано: 1. Не закрыто: 1/);
   const calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,2);assert.deepEqual(calls[0].payload.stockSources,[{requestItemId:'one-item',noBox:true,quantity:1}]);assert.equal(calls[1].payload.stockSources,undefined);assert.equal(calls[1].payload.allowOverweightPackages,false);
   assert.equal(await page.getByRole('checkbox',{name:'Выбрать заявку №000001'}).isChecked(),false);assert.equal(await page.getByRole('checkbox',{name:'Выбрать заявку №000002'}).isChecked(),true);
   await page.close();
  }
  console.log('PASS: source table + batch in classic, Soul and la_panthera; select-all, per-request errors, strict missing-source noBox');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
