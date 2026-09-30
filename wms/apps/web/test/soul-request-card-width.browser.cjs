const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// TEST: the real request and theme styles must keep Soul card cells readable at browser zoom widths.
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const viewportWidth of [1200, 900]) {
      const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } });
      await page.setContent(`
        <div class="app-layout" data-ui-theme="modern"><div class="workspace-content"><div class="soul-page">
          <div class="client-request-table-wrap"><table class="client-request-table"><tbody>
            <tr class="client-request-row">
              <td class="client-request-table__request-cell" data-label="Заявка"><div class="client-request-identity"><div class="client-request-identity__main"><span>№01554</span><span>Поставка WB-GI-28548319</span></div><div class="client-request-identity__details">FBS — 5 заказов</div></div></td>
              <td class="client-request-table__client-cell">Клиент</td>
              <td class="client-request-table__composition-cell" data-label="Состав">CL-000001 ИП Лукин Илья Ильич · 5 позиций</td>
              <td class="client-request-table__due-cell" data-label="Срок"><div class="client-request-due-status">Новая</div></td>
              <td class="client-request-table__status-cell">Новая</td>
              <td class="client-request-table__warehouse-cell">Склад</td>
              <td class="client-request-table__actions-cell">Действия</td>
            </tr>
          </tbody></table></div>
        </div></div></div>`);
      const webSrc = path.resolve(__dirname, '../src');
      for (const relative of ['styles.css', 'components/client-requests/client-requests.css', 'components/layout/la-panthera-theme.css', 'components/layout/soul-theme.css']) {
        await page.addStyleTag({ content: fs.readFileSync(path.join(webSrc, relative), 'utf8') });
      }
      await page.evaluate(() => {
        document.documentElement.dataset.uiTheme = 'modern';
        document.documentElement.dataset.uiVariant = 'soul';
      });
      const widths = await page.evaluate(() => Object.fromEntries(['request', 'composition', 'due'].map((name) => [name, document.querySelector(`.client-request-table__${name}-cell`).getBoundingClientRect().width])));
      assert.ok(widths.request >= 180, `${viewportWidth}px: request cell collapsed to ${widths.request}px`);
      assert.ok(widths.composition >= 300, `${viewportWidth}px: composition cell collapsed to ${widths.composition}px`);
      assert.ok(widths.due >= 75, `${viewportWidth}px: due/status cell collapsed to ${widths.due}px`);
      await page.close();
    }
    console.log('PASS Soul request cards at 1200px and 900px');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
