import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

// TEST: real browser cascade, including component CSS loaded AFTER the theme.
// Opt in with WMS_TEST_PLAYWRIGHT (installed package path); no network or user browser session.
const runtime = process.env.WMS_TEST_PLAYWRIGHT;
it.skipIf(!runtime).each([1440, 390])('keeps operational surfaces readable at %ipx without changing other themes', async (width) => {
  const { chromium } = createRequire(import.meta.url)(runtime!);
  const browser = await chromium.launch({ channel: process.env.WMS_TEST_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const components = new URL('../', import.meta.url);
    const files = ['../../styles.css', './spirit-theme.css', ...readdirSync(components, { recursive: true })
      .map(String).filter(f => f.endsWith('.css') && !/layout|marketing-landing/.test(f))
      .map(f => `../${f.replaceAll('\\', '/')}`)];
    const css = files.map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
    const surfaces = ['inventory-workbench', 'catalog-manual-card', 'contract-create-card', 'admin-section',
      'client-cabinet-client-editor', 'expenses-filters', 'kiz-dialog', 'dbs-setup-form', 'service-card',
      'ozfbo-card', 'turnover-cell-card', 'wms-ai-chat', 'packed-request__body', 'integration-api__form',
      'balance-review-panel', 'manual-box-selection-item', 'online-execution-section', 'box-overlap-panel'];
    const html = `<!doctype html><html data-ui-variant="spirit"><meta charset="utf-8"><style>${css}</style>
      <body><main class="app-layout" data-ui-variant="spirit"><div class="workspace-content">
      <section class="client-request-items-editor"><header class="client-request-items-editor__heading"><h3 data-check>Состав заявки</h3><p data-check>1 / 300 позиций</p></header>
      <label data-check>ШТРИХКОД</label><input value="2051621250518" data-check><button class="client-request-secondary-button" data-check>Строка</button></section>
      <section class="client-request-fbs-tails"><div class="client-request-fbs-tails__copy"><div><strong data-check>Новая заявка из хвостов FBS</strong><span data-check>Выберите клиента</span></div></div><div class="client-request-fbs-tails__actions"><label><span data-check>Клиент</span><select data-check><option>Лукин</option></select></label></div></section>
      <table class="client-request-table"><thead><tr><th data-check>Заявка</th></tr></thead><tbody><tr><td data-check>1513</td></tr></tbody></table>
      <button class="primary-button" data-check>Создать заявку</button><button disabled data-check>Недоступно</button>
      <div class="billing-client-register"><header class="billing-client-register__header"><strong data-check>Счета</strong></header></div>
      <div class="fbs-workspace"><h3 data-check>Заказы</h3></div>
      ${surfaces.map(c => `<section class="${c}"><h3 data-check>${c}</h3><input value="Тест" data-check><button data-check>Открыть</button></section>`).join('')}
      <span class="status status--done" data-check>Готово</span><span class="status status--cancelled" data-check>Отменено</span><span class="status status--planned" data-check>Новая</span>
      <div class="sticker-set__canvas"><small class="sticker-set__canvas-client" data-check>Клиент на этикетке</small><strong class="sticker-set__canvas-number" data-check>123</strong></div>
      </div></main><section class="confirm-dialog" role="dialog"><h3 data-check>Подтвердите</h3><ul class="confirm-dialog__details"><li data-check>Изменения сохранятся</li></ul><button class="primary-button confirm-dialog__secondary" data-check>Отмена</button></section>
      <pre id="result"></pre><script>(()=>{
      const lum=c=>{const v=c.match(/[\\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};
      const sample=()=>Array.from(document.querySelectorAll('[data-check]')).map(el=>{let p=el,bgs=[];while(p){const s=getComputedStyle(p);bgs=s.backgroundImage.match(/rgb\\([^)]+\\)/g)||[];if(bgs.length)break;const bg=s.backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent'){bgs=[bg];break;}p=p.parentElement;}const fg=getComputedStyle(el).color,a=lum(fg);return {text:el.textContent||el.value,fg,bgs,ratio:Math.min(...bgs.map(bg=>{const b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}))}});
      try{const spirit=sample();document.documentElement.dataset.uiVariant='modern';document.querySelector('main').dataset.uiVariant='modern';const light=getComputedStyle(document.querySelector('.client-request-items-editor')).backgroundColor;document.querySelector('#result').textContent=JSON.stringify({spirit,light});}catch(e){document.querySelector('#result').textContent=JSON.stringify({error:String(e)})}
      })()</script></body></html>`;
    const page = await browser.newPage();
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/*', (route: { abort: () => Promise<void> }) => route.abort());
    await page.setContent(html);
    const result = JSON.parse(await page.locator('#result').textContent());
    expect(result.error).toBeUndefined();
    for (const sample of result.spirit) expect(sample.ratio, JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
    expect(result.spirit.length).toBeGreaterThan(65);
    // TEST: compare with theme absent rather than assuming the legacy theme's colour.
    await page.setContent(html.replace(readFileSync(new URL('./spirit-theme.css', import.meta.url), 'utf8'), ''));
    const baseline = JSON.parse(await page.locator('#result').textContent());
    expect(result.light).toBe(baseline.light);
  } finally {
    await browser.close();
  }
}, 60000);
