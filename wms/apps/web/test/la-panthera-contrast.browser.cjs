const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../src');
const output = process.env.THEME_TEST_OUTPUT || 'D:/WMSFF/_Kof/work/la-panthera-contrast-release';
const fixtures = [
  // TEST: dashboard rows, metrics, icons and branch details.
  ['dashboard', '<section class="modern-dashboard"><section class="modern-dashboard__metrics"><article><span class="modern-dashboard__metric-icon modern-dashboard__metric-icon--blue">□</span><div><span>Рабочие модули</span><strong>37</strong><small>доступно</small></div></article></section><section class="modern-dashboard__panel"><header><h2>Сегодня</h2><span>5</span></header><div class="modern-dashboard__quick"><button><span>□</span><div><strong>Биллинг</strong><small>Услуги и счета</small></div></button></div><div class="modern-dashboard__queue"><button><span class="modern-dashboard__queue-icon is-danger">□</span><span><strong>КИЗ</strong><small>135 проблем</small></span><span class="modern-dashboard__queue-status">Проверить</span></button></div><div class="modern-dashboard__branches"><article><div><strong>Москва</strong><span>ФФ Москва</span></div><span class="modern-dashboard__branch-status">Выбран</span><dl><div><dt>Клиенты</dt><dd>42</dd></div></dl></article></div></section></section>'],
  // TEST: branch icon surfaces and captions.
  ['branches', '<article class="branch-card"><div class="branch-card__head"><span>□</span><div><strong>Москва</strong><small>MSK · ФФ Москва</small></div><em>Активный</em></div><p>Адрес пока не указан</p><div class="branch-card__metrics"><span><b>15841</b><small>товаров</small></span></div></article>'],
  // TEST: payroll actions, filters and summary stay readable with a compact border.
  ['payroll', '<section class="payroll-management"><header class="payroll-heading"><button>К расходам</button><h2>ФОТ</h2></header><div class="payroll-tiles"><button class="is-active">Табель и начисления</button><button>Работы</button></div><div class="payroll-fields"><label>Сотрудник<input value="Все сотрудники"></label></div><button disabled>Добавить запись</button><section class="payroll-payment-summary"><h3>Суммы и реквизиты</h3><div class="payroll-payment-detail">Не оплачено: 1000 ₽</div><div class="payroll-table"><table><tr><th>Действия</th><td><button>Редактировать</button></td></tr></table></div></section></section>'],
  // TEST: FBS entry hero and all nested menu accents must remain readable.
  ['fbs-menu', `<header class="fbs-panel__hero"><h2>Выберите маркетплейс</h2><p>Заказы и инструменты</p><span class="fbs-panel__scope">3 рабочих контура</span></header>${["red","green","amber","slate","violet","blue"].map(accent=>`<div class="fbs-tile fbs-tile--${accent}"><button class="fbs-tile__open"><span class="fbs-tile__icon">□</span><span class="fbs-tile__content"><span class="fbs-tile__number">1</span><strong>Активные заказы FBS</strong><small>Новые заказы, сборка и упаковка</small></span><span class="fbs-tile__count">114</span></button><div class="fbs-tile__clients"><span class="fbs-tile__clients-title">Клиенты с заказами</span><button class="is-selected"><span>ИП Лукин</span><strong>104</strong></button><button><span>ИП Королев</span><strong>2</strong></button></div></div>`).join("")}`],
 ['contracts', '<section class="contracts-panel"><h2>Договоры с клиентами</h2><section class="contract-create-card"><div class="contract-create-card__title"><strong>Создать договор</strong><span>Основная компания</span></div></section><article class="contract-card"><div class="contract-card__identity"><strong>Договор 0002</strong><span>Лукин</span></div><span class="contract-status contract-status--waiting">Ожидает подписи</span><div class="contract-card__meta"><span>Дата: 28.09.2026</span></div><div class="contract-card__actions"><button class="contract-requisites-check-button">Проверить договор</button><button class="contract-archive-button">В архив</button></div></article></section>'],
  ['labels', '<section class="print-panel"><header class="print-panel__heading"><h2>Печать</h2></header><div class="print-tabs"><button class="active">SKU</button><button>Шаблоны</button></div><div class="sku-label-flow__result"><label><input type="checkbox" checked><span><strong>Костюм сливочный</strong><small>L / 46</small></span></label></div><div class="print-preview"><h3>TSPL</h3><small>Команда принтера</small></div></section>'],
  ['inventory', '<section class="inventory"><div class="inventory-mode-grid"><button class="inventory-mode"><span class="inventory-mode__number">01</span><strong>Полная инвентаризация</strong><small>Проверка всех коробов</small></button></div></section>'],
  ['requests', '<div class="client-request-fbs-tails"><strong>Новая заявка из хвостов FBS</strong><span>Перенести заказы</span></div><section class="client-request-items-editor"><h3>Состав заявки</h3><button>Строка</button></section><p class="panel-message">Заявок пока нет</p><section class="online-execution-section"><h4>Фактическая сборка</h4><span>Собрано 1 из 1</span><div class="online-execution-search"><input placeholder="Найти заказ"></div><p class="online-execution-empty--done">Все товары собраны</p><button disabled class="client-request-action-button">Отгрузить</button></section>'],
  ['kiz', '<section class="kizc-panel"><div class="kizc-source"><strong>Wildberries</strong><small>Продажи и возвраты FBS</small><em>Подключено: 317</em></div><div class="kizc-tabs"><button class="active">Очередь</button><button>Пакеты</button></div><div class="kizc-sync-panel"><div class="kizc-sync-panel__title"><div><h3>Выгрузка продаж</h3><p>Выберите период</p></div></div></div><div class="kizc-workbar"><label class="kizc-select-all">Выбрать всё</label><span class="kizc-selection">Выбрано: 0</span></div><section class="kizc-queue"><header><h3>КИЗ после продажи</h3></header><table class="kizc-table"><tr><td><code>010468099259913215LxVhD7</code><small>Костюм спортивный</small></td><td><div class="kizc-price"><input placeholder="руб."><span>₽</span></div></td><td><span class="kizc-status kizc-status--needs_review">Нужна проверка</span></td></tr></table></section></section>'],
  ['logistics', '<section class="logistics-panel"><h2>Расчёт и заявки доставки</h2><div class="readonly-field">Москва</div><div class="quote-mode"><button class="active">Короба</button><button>Паллеты</button></div><section class="logistics-summary"><div class="logistics-summary-metric"><strong>200</strong><span>Заявки</span></div><div class="logistics-summary-row"><strong>Москва — Казань</strong><span>Проверка</span></div></section></section>'],
  ['api', '<section class="integration-api"><div class="integration-api__form"><h3>Новый доступ</h3><label>Клиент<input value="Лукин"></label><div class="integration-api__scopes"><label class="is-selected"><strong>Чтение остатков</strong><code>stock:read</code></label></div></div><div class="integration-api__registry"><h3>Выданные доступы</h3><dl><dt>Последний запрос</dt><dd>28.09.2026</dd></dl><div class="integration-api__scope-tags"><code>stock:read</code></div><button>Обновить</button></div></section>'],
  ['monitor', '<section class="tsd-monitor"><article class="tsd-feed" style="width:300px"><div class="tsd-feed__current-item"><span>Текущее действие</span><strong>Костюм спортивный брючный с капюшоном Коричневый меланж размер XL / 50</strong><small>Короб FFL_LKBS2409_004</small></div><div class="tsd-feed__connection is-online">В сети</div><button class="tsd-feed__errors-button has-errors">Ошибки 20</button></article></section>'],
  ['service', '<section class="service-panel"><div class="service-mobile-app"><strong>LOGOff WMS Mobile</strong><small>Приложение для Android</small></div><div class="service-tiles"><button class="service-tile"><span>Замена размера WB</span></button></div><div class="service-tabs"><button><span>Проверка печати</span></button></div></section>'],
  ['admin', '<section class="administration"><section class="admin-section"><h3>Центр управления</h3><div class="admin-metrics"><article><span>Пользователи</span><strong>48</strong></article></div><div class="admin-card admin-card--green"><h3>Защитный контур</h3><p>Аудит действий</p></div></section></section>'],
  ['printing', '<div class="order-assembly__apps"><article class="order-assembly__app-tile is-green"><span>□</span><div><small>ПЕЧАТНАЯ СТАНЦИЯ</small><h3>Подключение принтера</h3><p>Скачайте агент печати</p></div></article><a class="order-assembly__app-tile is-sos"><span>□</span><div><small>ПРИЛОЖЕНИЕ</small><h3>SOS WB 2</h3><p>Четыре режима</p></div></a></div>'],
  ['fbs', '<section class="fbs-workspace"><h3>Активные заказы по FBS</h3><section class="fbs-supply-request-tool"><label><span>Создать заявку</span></label><small>Выберите поставку</small></section><section class="fbs-supply-request-audit"><div class="fbs-supply-request-audit__header"><strong>Проверить поставки</strong></div></section><div class="fbs-order-summary"><article><span>Заказов</span><strong>95</strong></article></div><div class="fbs-order-actions"><strong>Выбрано: 0</strong></div></section>'],
  ['warehouse', '<section class="warehouse-panel"><h2>Короба</h2><div class="warehouse-box-view-toggle"><button class="is-active">Короба на складе</button><button>Архив</button></div><div class="warehouse-box-search__input"><input placeholder="Номер короба"></div></section>'],
];
// TEST: actual feature CSS loaded after the theme catches hardcoded light surfaces and specificity regressions.
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.setContent('<html data-ui-theme="modern" data-ui-variant="classic"><body><main class="app-layout" data-ui-theme="modern"><aside class="app-sidebar"><div class="app-sidebar__brand"><strong>LOGOFF</strong><span>WMS</span></div><nav class="app-sidebar__nav"><button><svg></svg><span>Фабрика</span></button></nav></aside><div class="workspace-shell"><header class="workspace-header"><label class="ui-theme-switcher"><select><option>la_panthera</option></select></label><div class="workspace-user"><div><strong>Пользователь</strong></div></div></header><div class="workspace-content">' + fixtures.map(([id, html]) => `<div id="${id}" style="padding:12px">${html}</div>`).join('') + '</div></div></main></body></html>');
    await page.addStyleTag({ path: path.join(root, 'styles.css') });
    // Fixture has no application header; keep the host tall enough for visual inspection.
    await page.addStyleTag({content: '.app-layout{min-height:100vh}.workspace-shell{height:auto!important;overflow:visible!important}.workspace-content{height:auto!important;max-height:none!important;overflow:visible!important}'});
    const before = await page.locator('.warehouse-panel').evaluate(e => getComputedStyle(e).backgroundColor);
    await page.addStyleTag({ path: process.env.THEME_CSS || path.join(root, 'components/layout/la-panthera-theme.css') });
    assert.equal(await page.locator('.warehouse-panel').evaluate(e => getComputedStyle(e).backgroundColor), before);
    for (const file of ['client-requests/client-requests.css', 'kiz-circulation/kiz-circulation.css', 'logistics/logistics.css', 'integration-api/integration-api.css', 'monitoring/tsd-monitoring.css', 'service/service-center.css', 'administration/administration.css', 'fbs/fbs.css', 'warehouse/warehouse.css', 'inventory/inventory.css', 'print/print.css', 'contracts/contracts.css', 'expenses/payroll.css', 'branches/branches.css']) await page.addStyleTag({ path: path.join(root, 'components', file) });
    if (process.env.RUNTIME_CSS) await page.addStyleTag({path: process.env.RUNTIME_CSS});
    await page.evaluate(() => document.documentElement.dataset.uiVariant = 'la_panthera');
    await page.waitForTimeout(300); // Allow existing theme colour transitions to settle.
    const failures = await page.evaluate(() => {
      const rgb = text => text.match(/[\d.]+/g).map(Number);
      const lum = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((v, n, i) => v + n * [.2126, .7152, .0722][i], 0);
      const failures = [];
      for (const el of document.querySelectorAll('.workspace-content *')) {
        if (!el.textContent.trim() || el.children.length || ['INPUT', 'STYLE'].includes(el.tagName)) continue;
        const style = getComputedStyle(el);
        const fg = rgb(style.color); if (fg[3] === 0) continue;
        let node = el, background, layers = [];
        while (node) {
          const st = getComputedStyle(node), color = rgb(st.backgroundColor);
          if (st.backgroundImage.includes('gradient')) { background = [...st.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m => rgb(m[0])).sort((a,b) => lum(b)-lum(a))[0]; if (background) break; }
          if (color[3] === undefined || color[3] === 1) { background = color; break; }
          if (color[3] > 0) layers.push(color);
          node = node.parentElement;
        }
        if (!background) background = [15, 15, 17];
        for (const layer of layers.reverse()) background = background.slice(0,3).map((v,i) => layer[i]*layer[3]+v*(1-layer[3]));
        const a = lum(fg), b = lum(background), contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        if (contrast < 4.5 || (b > .15 && el.textContent !== '□' && !el.closest('button.active, button.is-active, .client-request-row-fbs-link'))) failures.push({text: el.textContent.slice(0, 50), fg: style.color, background, contrast});
      }
      return failures;
    });
    assert.deepEqual(failures, [], 'Every operational sample needs dark background and >=4.5:1 text contrast');
    assert.equal(await page.locator('.app-sidebar__nav svg').evaluate(e=>getComputedStyle(e).color), 'rgb(193, 84, 193)');
    assert.equal(await page.locator('.app-sidebar__nav span').evaluate(e=>getComputedStyle(e).color), 'rgb(192, 209, 255)');
    assert.equal(await page.locator('.payroll-payment-summary').evaluate(e=>getComputedStyle(e).paddingTop), '8px');
    // TEST: user-specified theme, account and brand colours.
    for (const selector of ['.ui-theme-switcher select', '.workspace-user > div > strong']) assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).color), 'rgb(248, 0, 0)');
    assert.equal(await page.locator('.app-sidebar__brand strong').evaluate(e=>getComputedStyle(e).color), 'rgb(248, 0, 0)');
    // TEST: larger FBS descriptions leave room above the absolute counter.
    assert.equal(await page.locator('.fbs-tile__content small').first().evaluate(e=>getComputedStyle(e).fontSize), '14px');
    assert.equal(await page.locator('.fbs-tile__icon').first().evaluate(e=>getComputedStyle(e).color), 'rgb(255, 255, 255)');
    assert(await page.locator('.fbs-tile__open').first().evaluate(e=>e.querySelector('small').getBoundingClientRect().bottom <= e.querySelector('.fbs-tile__count').getBoundingClientRect().top));
    const product = page.locator('.tsd-feed__current-item strong');
    assert.equal(await product.evaluate(e => getComputedStyle(e).whiteSpace), 'normal');
    assert(await product.evaluate(e => e.clientHeight > parseFloat(getComputedStyle(e).lineHeight)), 'Full product name wraps');
    for (const [id] of fixtures) {
      await page.evaluate(id => { for (const el of document.querySelector('.workspace-content').children) el.style.display = el.id === id ? 'block' : 'none'; }, id);
      await page.locator('#' + id).screenshot({ path: path.join(output, id + '.png') });
    }
    await page.evaluate(() => { for (const el of document.querySelector('.workspace-content').children) el.style.display = 'block'; });
    await page.emulateMedia({media: 'print'});
    assert.equal(await product.evaluate(e => getComputedStyle(e).whiteSpace), 'nowrap', 'Theme must not modify printing');
    console.log('PASS: 17 operational views, real feature CSS, >=4.5:1 contrast, dark panels, full product name, theme isolation and print exclusion');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
