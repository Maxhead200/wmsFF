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
    // TEST: production uses modern tokens beneath Spirit, including text-primary.
    const html = `<!doctype html><html data-ui-theme="modern" data-ui-variant="spirit"><meta charset="utf-8"><style>${css}</style>
      <body><main class="app-layout" data-ui-theme="modern" data-ui-variant="spirit"><div class="workspace-content">
      ${['workspace-tile','admin-tech-tile','warehouse-topic-tile','billing-topic-tile','directory-topic-tile','print-topic-tile'].map(c => `<button class="${c}"><span class="${c}__icon"><svg data-check width="24" height="24" fill="none" stroke="currentColor"><path d="M2 2L22 22"/></svg></span><strong data-check>${c}</strong></button>`).join('')}
      <div class="client-services-toolbar"><label><span data-check>Клиент</span><select data-check><option>Лукин</option></select></label><div class="client-services-search"><span data-check>Поиск</span></div><div class="client-services-toolbar__summary" data-check>Подключено 0</div></div>
      <div class="fbs-pricing-default is-active"><strong data-check>Калькулятор FBS</strong><span data-check>Работает автоматически</span><em data-check>Активен</em></div>
      ${['','is-enabled','fbs-turnkey-card--logistics is-enabled','fbs-turnkey-card--primary is-enabled'].map(c => `<section class="fbs-turnkey-card ${c}"><div class="fbs-turnkey-card__copy"><strong data-check>FBS под ключ</strong><span data-check>Фиксированная цена</span></div></section>`).join('')}
      <section class="fbs-turnkey-card"><div class="fbs-pricing__service-picker"><div><label class="is-selected"><span><strong data-check>Услуга выбрана</strong><small data-check>Тариф клиента</small></span></label></div></div></section>
      <div class="panel-message" data-check>Нет счетов</div>
      <section class="tsd-monitor"><div class="tsd-feed__connection is-online" data-check>В сети</div><div class="tsd-feed__idle" data-check>На устройстве нет открытой заявки</div><div class="tsd-monitor__error" data-check>Ошибка синхронизации</div><div class="tsd-monitor__notice" data-check>Операция завершена</div></section>
      <div class="directory-result" data-check>Клиент сохранён</div><label class="directory-file-input" data-check>Выберите файл</label>
      <section class="expenses-panel"><header class="expenses-header"><h2 data-check>Расходы</h2><p data-check>Материалы и логистика</p></header></section>
      <section class="tsd-monitor"><h2 data-check>Мониторинг ТСД</h2><p class="tsd-monitor__subtitle" data-check>Живое состояние устройств</p><article class="tsd-feed"><h3 data-check>Гулрух</h3></article></section>
      <article class="branch-card branch-card--active"><h3 data-check>Москва</h3></article><article class="branch-card"><h3 data-check>Ногинск</h3></article>
      <section class="client-requisites-card"><h3 data-check>Новый клиент</h3><label class="directory-checkbox"><input type="checkbox"><span data-check>Вести учёт хранения</span></label><fieldset class="client-stock-mode"><legend data-check>Какие остатки учитывать</legend><label><input type="radio"><span><strong data-check>На паллетосортах</strong><small data-check>Только размещённые короба</small></span></label></fieldset></section>
      <section class="client-request-items-editor"><header class="client-request-items-editor__heading"><h3 data-check>Состав заявки</h3><p data-check>1 / 300 позиций</p></header>
      <label data-check>ШТРИХКОД</label><input value="2051621250518" data-check><button class="client-request-secondary-button" data-check>Строка</button></section>
      <section class="client-request-fbs-tails"><div class="client-request-fbs-tails__copy"><div><strong data-check>Новая заявка из хвостов FBS</strong><span data-check>Выберите клиента</span></div></div><div class="client-request-fbs-tails__actions"><label><span data-check>Клиент</span><select data-check><option>Лукин</option></select></label></div></section>
      <table class="client-request-table"><thead><tr><th data-check>Заявка</th></tr></thead><tbody><tr><td data-check>1513</td></tr></tbody></table>
      <button class="primary-button" data-check>Создать заявку</button><button disabled data-check>Недоступно</button>
      <div class="billing-client-register"><header class="billing-client-register__header"><strong data-check>Счета</strong></header></div>
      <div class="fbs-workspace"><h3 data-check>Заказы</h3></div>
      <section class="analytics-card analytics-placement-actions">
      <div class="analytics-card__heading analytics-regional-heading"><div><span><strong data-check>Куда и какой товар поставить</strong><small data-check>Приоритетные поставки LOGOFF</small></span></div></div>
      <div class="analytics-model-note"><span data-check>Распределение является расчётной оценкой</span></div>
      <div class="analytics-placement-list"><article>
      <div class="analytics-placement-product"><span></span><span><strong data-check>Костюм спортивный</strong><small data-check>Стрит_анорак_графит</small></span></div>
      <div><small data-check>Регион</small><strong data-check>Центральный</strong><em data-check>37,3% спроса товара</em></div>
      <div><small data-check>Расчётный провал</small><strong data-check>95 шт.</strong></div>
      <div><strong class="analytics-supply-positive" data-check>95 шт.</strong><em data-check>в LOGOFF 121 шт.</em></div>
      <div><span class="analytics-dynamic positive" data-check>+4,8%</span></div>
      </article></div></section>
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
    expect(result.spirit.filter((sample: { ratio: number }) => sample.ratio < 4.5)).toEqual([]);
    expect(result.spirit.length).toBeGreaterThan(65);
    // TEST: requested font applies to headings and native controls, not just body.
    await page.evaluate(() => {
      document.documentElement.dataset.uiVariant = 'spirit';
      (document.querySelector('main') as HTMLElement).dataset.uiVariant = 'spirit';
    });
    for (const selector of ['.analytics-placement-product strong', '.analytics-card__heading strong', 'input', 'button', 'select']) {
      expect(await page.locator(selector).first().evaluate((el: Element) => getComputedStyle(el).fontFamily)).toContain('Cambria');
    }
    for (const selector of ['.analytics-supply-positive', '.analytics-dynamic.positive']) {
      expect(await page.locator(selector).evaluate((el: Element) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    }
    // TEST: active branch must differ from its neighbours beyond the small badge.
    const branchColours = await page.locator('.branch-card').evaluateAll((els: Element[]) => els.map(el => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderColor })));
    expect(branchColours[0].bg).not.toBe(branchColours[1].bg);
    expect(branchColours[0].border).not.toBe(branchColours[1].border);
    // TEST: compare with theme absent rather than assuming the legacy theme's colour.
    await page.setContent(html.replace(readFileSync(new URL('./spirit-theme.css', import.meta.url), 'utf8'), ''));
    const baseline = JSON.parse(await page.locator('#result').textContent());
    expect(result.light).toBe(baseline.light);
  } finally {
    await browser.close();
  }
}, 60000);
