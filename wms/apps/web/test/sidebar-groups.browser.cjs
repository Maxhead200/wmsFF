const assert=require('node:assert/strict'),path=require('node:path'),{createRequire}=require('node:module');
const web=path.resolve(__dirname,'..'),req=createRequire(path.join(web,'package.json')),vite=createRequire(req.resolve('vite/package.json'));
const {chromium}=require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: independent disclosures, persisted preferences, active route reveal and other-theme parity.
(async()=>{
 const bundle=await vite('esbuild').build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SidebarGroup}from'./src/components/layout/SidebarGroup';const root=createRoot(document.getElementById('root'));window.render=(active='requests',theme=true,key='a')=>root.render(<React.Fragment key={key}>{['requests','warehouse','management'].map(id=><SidebarGroup key={id} id={id} title={id} userId="test" activeId={id===active?active:null} collapsible={theme}><button>{id}</button></SidebarGroup>)}</React.Fragment>);window.render();`,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.route('http://sidebar.test/',route=>route.fulfill({contentType:'text/html',body:'<html data-ui-theme="modern" data-ui-variant="la_panthera"><body><nav id="root" class="workspace-nav"></nav></body></html>'}));await page.goto('http://sidebar.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.addStyleTag({path:path.join(web,'src/components/layout/la-panthera-theme.css')});
  await page.locator('details').first().waitFor();assert.equal(await page.locator('details[open]').count(),1);
  await page.getByText('warehouse',{exact:true}).first().click();await page.getByText('management',{exact:true}).first().click();assert.equal(await page.locator('details[open]').count(),3);
  await page.getByText('requests',{exact:true}).first().click();assert.equal(await page.locator('details[open]').count(),2);
  await page.waitForFunction(()=>localStorage.getItem('wms.panthera.sidebar.test.management')==='open');
  await page.evaluate(()=>window.render(null,true,'b'));await page.waitForFunction(()=>document.querySelectorAll('details[open]').length===2);
  await page.evaluate(()=>window.render('requests',true,'b'));await page.waitForFunction(()=>document.querySelectorAll('details[open]').length===3);
  await page.locator('summary').nth(1).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelectorAll('details[open]').length===2);
  await page.evaluate(()=>window.render('requests',false));await page.waitForFunction(()=>document.querySelectorAll('section.workspace-nav__group').length===3);assert.equal(await page.locator('details').count(),0);
  console.log('PASS: sidebar independent groups, keyboard disclosure, persistence, active route and other themes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
