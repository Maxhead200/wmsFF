const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const esbuild=require(process.env.ESBUILD_MODULE || 'esbuild');
// TEST: actual React forms, retained pages and production CSS; no business API calls.
test('la_panthera windows retain drafts and WB tiles are square',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panthera-windows-'));
 const source=process.env.PANTHERA_COMPONENT || path.join(__dirname,'PantheraWorkspaces.tsx');
 const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{PantheraWorkspaces}from ${JSON.stringify(source)};
 function Page({id}){const[open,setOpen]=useState('');return <><p data-page>{id} page behind</p><button onClick={()=>setOpen('A')}>Open A</button><button onClick={()=>setOpen('B')}>Open B</button>{open&&<div className={id==='fbs'?'fbs-assembly-dialog-backdrop':'online-execution-modal'} role="dialog"><section className="online-execution-modal__panel"><header className={id==='fbs'?'fbs-assembly-dialog__heading':'online-execution-modal__header'}><h3>{id} {open}</h3><div className="online-execution-modal__actions request-online-toolbar" style={{marginTop:24}}><button className="icon-button">Refresh</button><button title="Закрыть" className="icon-button" onClick={()=>setOpen('')}>Close</button></div></header><input aria-label="Draft" defaultValue="initial"/></section></div>}</>}

 function App(){const[id,setId]=useState('requests');return <div className="app-layout"><button onClick={()=>setId('fbs')}>FBS</button><PantheraWorkspaces activeId={id} onOpen={setId} render={key=><Page id={key}/>}/></div>}createRoot(document.getElementById('root')).render(<App/>);`;
 const bundle=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:path.resolve(__dirname,'../../..')},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},nodePaths:[path.resolve(__dirname,'../../../node_modules'), 'D:/WMSFF/_Kof/wms/node_modules']});
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 try{
  const css=['../client-requests/client-requests.css','../client-requests/request-action-menus.css','../fbs/fbs.css','la-panthera-theme.css','la-panthera-light.css','panthera-windows.css'].filter(f=>!process.env.PANTHERA_BASELINE || f!=='panthera-windows.css').map(f=>fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n');
  const page=await browser.newPage({viewport:{width:1600,height:1000}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<html data-ui-variant="la_panthera" data-ui-theme="modern" data-ui-style="light"><style>*{box-sizing:border-box}body{font:14px Arial}${css}</style><div id="root"></div></html>`);await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('button',{name:'Open A',exact:true}).click();
  await page.getByLabel('Draft').fill('saved draft A');
  const centers=await page.locator('[title="Закрыть"],.panthera-window-minimize').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2}));
  assert.equal(centers.length,2);assert(Math.abs(centers[0]-centers[1])<1,'minimize and close must align');
  assert.equal(await page.locator('[role=dialog]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(15, 23, 42, 0.28)');
  await page.getByRole('button',{name:'Свернуть окно',exact:true}).click();
  await page.getByRole('button',{name:'Open B',exact:true}).click();assert.equal(await page.locator('[role=dialog]:visible').count(),1,'second window must open independently');await page.getByLabel('Draft').filter({visible:true}).fill('saved draft B');
  await page.getByRole('button',{name:'Свернуть окно',exact:true}).click();assert.equal(await page.locator('.panthera-window-dock button').count(),2);
  await page.getByTitle('Развернуть: requests A').click();assert.equal(await page.getByLabel('Draft').filter({visible:true}).inputValue(),'saved draft A');
  await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.locator('.panthera-window-dock button').count(),1);
  await page.getByRole('button',{name:'FBS',exact:true}).click();await page.getByRole('button',{name:'Open A',exact:true}).click();await page.getByLabel('Draft').filter({visible:true}).fill('FBS independent');
  await page.getByRole('button',{name:'Свернуть окно',exact:true}).click();assert.equal(await page.locator('.panthera-window-dock button').count(),2);
  await page.getByTitle('Развернуть: requests B').click();assert.equal(await page.getByLabel('Draft').filter({visible:true}).inputValue(),'saved draft B');await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByTitle('Развернуть: fbs A').click();assert.equal(await page.getByLabel('Draft').filter({visible:true}).inputValue(),'FBS independent');await page.getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(errors,[]);
  const titles=['Активные заказы FBS','Контроль автоотмены','Товары FBS','Распределение остатков','Короба WMS','Отгруженные','Отчёт по товарам FBS','Отменённые заказы','Стоимость обработки FBS','Калькулятор стоимости','Архив','Пропуска WB','Назначение стоимости обработки','Штрафы по FBS','Повторный довоз'];
  const tiles=titles.map((t,i)=>`<div class="fbs-tile fbs-tile--red ${i===0?'fbs-tile--has-clients':''}"><button class="fbs-tile__open"><span class="fbs-tile__icon">◈</span><span class="fbs-tile__content"><span class="fbs-tile__number">${i+1}</span><strong>${t}</strong><small>Подробное описание плитки</small></span><span class="fbs-tile__count">284</span></button>${i===0?'<div class="fbs-tile__clients"><button>ИП Лукин 271</button><button>Другой клиент 5</button></div>':''}</div>`).join('');
  await page.locator('.app-layout').evaluate((e,tiles)=>e.insertAdjacentHTML('beforeend',`<div class="fbs-tiles" data-marketplace="WILDBERRIES">${tiles}</div>`),tiles);
  for(const width of [1920,1440,1024,390])for(const style of ['light','dark']){
   await page.setViewportSize({width,height:1000});await page.evaluate(style=>document.documentElement.dataset.uiStyle=style,style);
   const rects=await page.locator('.fbs-tile').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();const b=e.querySelector('button');return{x:r.x,y:r.y,w:r.width,h:r.height,overflow:b.scrollHeight>b.clientHeight+1}}));
   rects.slice(1).forEach(r=>{assert(Math.abs(r.w-r.h)<1,JSON.stringify({width,style,r}));assert(!r.overflow,JSON.stringify({width,style,r}));});
   if(width>=1440){assert.equal(rects[1].y,rects[7].y);assert.equal(rects[8].y,rects[14].y);assert.equal(rects[1].x,rects[8].x);assert(Math.abs(rects[0].h-(rects[1].h*2+10))<1);}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.evaluate(()=>document.documentElement.dataset.uiVariant='modern');
  assert.notEqual(await page.locator('.fbs-tile').nth(1).evaluate(e=>getComputedStyle(e).aspectRatio),'1 / 1');
  await page.evaluate(()=>{document.documentElement.dataset.uiVariant='la_panthera';document.querySelector('.fbs-tiles').dataset.marketplace='OZON'});
  assert.notEqual(await page.locator('.fbs-tile').nth(1).evaluate(e=>getComputedStyle(e).aspectRatio),'1 / 1');
  await page.close();
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});
