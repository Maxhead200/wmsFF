// TEST: actual React effects, authenticated transport, drilldown and refresh use local fixtures only.
const path = require('node:path'), fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const web = path.resolve(__dirname, '..');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json', { paths: [web] }))] }));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const out = path.resolve(web, '../../work/billing-settlements-browser');
const line = { id: 'ch1', kind: 'CHARGE', date: '2026-10-01', description: 'Обработка FBS', requestNumber: 1244, orderIds: ['5894299305'],
  quantity: '2', unitPriceRub: '50', totalRub: 100, invoices: [], buckets: ['unbilled'] };
const report = { enabled: true, periodFrom: '2026-10-01', periodTo: '2026-10-02', warehouseId: 'w1', warehouseName: 'Москва', calculatedAt: '2026-10-02',
  rows: [{ client: { id: 'c1', code: 'CL1', name: 'Тестовый клиент' }, warehouseId: 'w1', warehouseName: 'Москва', unbilledRub: 100,
    draftRub: 0, reviewRub: 0, debtRub: 75, overdueRub: 75, clientAdvanceRub: 90, missingWorkCount: 1, lines: [line] }],
  issues: [{ id: 'work', clientId: 'c1', clientName: 'Тестовый клиент', code: 'WORK_WITHOUT_CHARGE', reason: 'Обработка выполнена, начисление не найдено.',
    action: 'Проверить тариф', line: { ...line, id: 'work', totalRub: null, unitPriceRub: undefined, kind: 'WORK' } }] };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {BillingSettlementsPanel} from './src/components/billing/BillingSettlementsPanel';
    createRoot(document.getElementById('root')).render(<BillingSettlementsPanel session={{accessToken:'fixture-only',user:{activeWarehouseId:'w1'}}}
      clients={[{id:'c1',name:'Тестовый клиент'}]} onReview={(id,section)=>{window.review={id,section}}}/>);`,
    resolveDir: web, loader: 'tsx' }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_URL': '"/api/v1"', 'process.env.NODE_ENV': '"production"' }, outfile: path.join(out, 'fixture.js') });
  const calls = [], errors = []; let mode = 'normal';
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/v1/')) {
      calls.push({ url: req.url, authorization: req.headers.authorization, method: req.method });
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'error') { res.statusCode = 403; res.end(JSON.stringify({ message: 'Нет доступа к филиалу' })); }
      else res.end(JSON.stringify(mode === 'disabled' ? { enabled: false } : report)); return;
    }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>'); return; }
    const file = req.url === '/fixture.js' ? 'fixture.js' : req.url === '/fixture.css' ? 'fixture.css' : null;
    if (!file) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('js') ? 'text/javascript' : 'text/css'); res.end(fs.readFileSync(path.join(out, file)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const amount = page.getByRole('button', { name: /^Не выставлено:/ }); await amount.waitFor(); await amount.click();
    const details = page.getByRole('region', { name: 'Расшифровка суммы' }); await details.waitFor();
    await details.locator('summary').click(); assert.match(await details.textContent(), /№1244/); assert.match(await details.textContent(), /5894299305/);
    assert.match(await page.getByRole('region', { name: 'Требует проверки' }).textContent(), /Сумма не определена/);
    await page.getByRole('button', { name: 'Открыть начисления клиента' }).click();
    assert.deepEqual(await page.evaluate(() => window.review), { id: 'c1', section: 'charges' });
    assert.equal(calls[0].authorization, 'Bearer fixture-only'); assert(calls.every(c => c.method === 'GET'));
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.locator('.billing-settlements__scroll').evaluate(e => e.scrollWidth > e.clientWidth));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    mode = 'error'; await page.getByRole('button', { name: 'Обновить расчёты' }).click();
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').textContent(), /Нет доступа/);
    assert.equal(await page.locator('table').count(), 0);
    mode = 'disabled'; await page.getByRole('button', { name: 'Обновить расчёты' }).click(); await page.getByText('Реестр расчётов пока не включён для этого склада.').waitFor();
    assert.equal(await page.locator('table').count(), 0); assert.deepEqual(errors, []);
    console.log('PASS: real UI drilldown, missing-work queue, review navigation, auth, mobile layout, refresh error and disabled deployment');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
