// TEST: measure the actual CSS in desktop/light/dark/mobile, including the production theme overrides.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
test('shift editor fits its contents without stretching, overflow or stacked desktop actions',async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
 try {
  const css=['payroll.css','../layout/la-panthera-theme.css','../layout/la-panthera-light.css'].map(f=>fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n');
  const component=fs.readFileSync(path.join(__dirname,'PayrollManagement.tsx'),'utf8');
  assert(component.includes("className={tab === 'work' ? 'payroll-shift-dialog' : undefined}"));
  for(const [width,height,style] of [[1440,900,'light'],[1440,900,'dark'],[390,844,'light'],[800,450,'dark']]) {
   const page=await browser.newPage({viewport:{width,height}});
   await page.setContent(`<html data-ui-theme="modern" data-ui-variant="la_panthera" data-ui-style="${style}"><style>body{margin:0;font:16px Arial}*{box-sizing:border-box}${css}</style><div class="payroll-management"><form class="payroll-shift-dialog" role="dialog" style="position:fixed;inset:10% 5%;z-index:1000;background:white;padding:24px;overflow-y:auto;box-shadow:0 0 0 100vmax #0008;border-radius:16px"><h3>Редактировать приход и уход</h3><div class="payroll-fields"><label>Начало, МСК<input type="datetime-local" step="1" value="2026-09-28T14:00:16"></label><label>Уход, МСК<input type="datetime-local" step="1" value="2026-09-28T21:51:20"></label><label>Комментарий / основание<input></label><label>Обед за весь день, минут<input placeholder="Автоматически"><small>Пусто — автоматически; 0 — без обеда. Вычет один на все выходы за день.</small></label></div><button>Сохранить</button><button>Отмена</button><button>Удалить запись</button></form></div></html>`);
   const m=await page.locator('form').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,bottom:r.bottom,overflow:el.scrollWidth>el.clientWidth,buttons:[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect().top)}});
   assert(m.width<=720 && m.width<=width-24);assert(m.height<=height-24);assert(m.top>=0 && m.bottom<=height);assert(!m.overflow);
   if(width>=1000){assert(m.height<480);assert.equal(new Set(m.buttons).size,1);}
   if(process.env.PAYROLL_SCREENSHOT && width===1440 && style==='light')await page.screenshot({path:process.env.PAYROLL_SCREENSHOT});
   // TEST: other installations/themes retain their original dialog geometry.
   if(width===1440){
    await page.evaluate(()=>document.documentElement.dataset.uiVariant='classic');
    assert((await page.locator('form').boundingBox()).width>720);
   }
   await page.close();
  }
 }finally{await browser.close();}
});

