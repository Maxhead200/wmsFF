const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'..'),req=createRequire(path.join(web,'package.json')),vite=createRequire(req.resolve('vite/package.json'));
const {chromium}=require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: real React callbacks, keyboard disclosures, theme independence and recovery permissions.
(async()=>{
const built=await vite('esbuild').build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ClientRequestsTable}from'./src/components/client-requests/ClientRequestsTable';
window.calls=[];const root=createRoot(document.getElementById('root'));window.render=(fbs=true,admin=true,status='SUBMITTED')=>{const props={modernActions:true,canManageRequestRecovery:admin,canChangeStatus:true,canPickOutbound:true,canCancelRequests:true,canEditAnyRequest:false,canRefreshPickInstruction:true,items:[{id:'r',number:1550,type:'OUTBOUND',status,priority:'NORMAL',title:fbs?'FBS — 3 заказа':'ФБО Никольское',client:{id:'c',code:'CL-000001',name:'ИП Лукин Илья Ильич'},clientId:'c',createdAt:'2026-09-29T09:00:00Z',items:[{id:'i',quantity:2}],packages:[],files:[]}]};for(const k of ['onStatusChange','onCancelRequest','onEditRequest','onOpenOnlineExecution','onOpenFbsOrders','onOpenFbsRoute','onSelectManualBoxes','onOpenFbsBoxSearch','onOpenPickInstruction','onRefreshPickInstruction','onSyncTsd','onCheckSupplyConsistency','onDownloadPickInstruction','onUploadManualInstruction','onEmergencyPackedXlsx','onPickOutbound','onPackageOutbound','onShipOutbound'])props[k]=(r)=>window.calls.push([k,r?.id||r]);root.render(<ClientRequestsTable {...props}/>)};window.render();`,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<html data-ui-theme="modern"><body><div id="root" class="app-layout workspace-content" data-ui-theme="modern" style="display:block"></div></body></html>');
for(const name of ['styles.css','components/client-requests/client-requests.css','components/layout/la-panthera-theme.css','components/layout/la-panthera-light.css','components/client-requests/request-action-menus.css'])await page.addStyleTag({content:fs.readFileSync(path.join(web,'src',name),'utf8')});
await page.addScriptTag({content:built.outputFiles[0].text});
for(const variant of ['default','classic','soul','space','spirit','la_panthera'])for(const style of variant==='la_panthera'?['dark','light']:['dark']){
await page.evaluate(({variant,style})=>{document.documentElement.dataset.uiVariant=variant;document.documentElement.dataset.uiStyle=style;window.render();window.calls=[];document.querySelectorAll('details').forEach(e=>e.open=false);},{variant,style});
await page.getByRole('button',{name:'Открыть сборку',exact:true}).click();await page.getByRole('button',{name:'Маршрут',exact:true}).click();await page.getByRole('button',{name:'К заказам FBS',exact:true}).click();await page.getByRole('button',{name:'Остатки и короба',exact:true}).click();
assert.equal(await page.getByRole('button',{name:'Отменить заявку',exact:true}).isVisible(),false);
const extra=page.locator('.request-action-menu summary').filter({hasText:/^Ещё$/});await extra.focus();await page.keyboard.press('Enter');
for(const name of ['Источники товара','Проверить с WB','Синхронизировать задания','Проверить задания и маршруты','Редактировать заявку','Отменить заявку'])await page.getByRole('button',{name,exact:true}).click();
await page.locator('.request-action-menu summary').filter({hasText:/^Администрирование$/}).click();await page.getByRole('button',{name:'Аварийная упаковка из Excel',exact:true}).click();
await page.locator('.request-action-menu summary').filter({hasText:/^Документы$/}).click();await page.getByRole('button',{name:'Инструкция',exact:true}).click();await page.getByRole('button',{name:'Лист подбора',exact:true}).click();
const calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,13);assert.ok(calls.every(c=>c[1]==='r'));assert.equal(new Set(calls.map(c=>c[0])).size,13);
await extra.click();await page.locator('.request-action-menu summary').filter({hasText:/^Документы$/}).click();
}
await page.evaluate(()=>window.render(false,false));await page.getByRole('button',{name:'Обновить план',exact:true}).waitFor();await page.locator('.request-action-menu summary').filter({hasText:/^Ещё$/}).click();assert.equal(await page.getByText('Администрирование',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Маршрут',exact:true}).count(),0);
await page.evaluate(()=>window.render(false,false,'DONE'));await page.waitForTimeout(50);assert.equal(await page.getByRole('button',{name:'Обновить план',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Отменить заявку',exact:true}).count(),0);
await page.evaluate(()=>window.render(true,true));await page.waitForTimeout(50);for(const el of await page.locator('details[open]').all())await el.evaluate(e=>e.open=false);
if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
assert.deepEqual(errors,[]);console.log('PASS: request menus, 13 distinct callbacks, keyboard, themes, FBO/FBS, admin and terminal status restrictions');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
