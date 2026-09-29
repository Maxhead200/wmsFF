const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: production auto-assembly history uses a legacy light surface, loaded after the theme.
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  const page = await browser.newPage();
  await page.setContent('<html data-ui-theme="modern" data-ui-variant="la_panthera"><body><div class="auto-assembly-report"><strong>28.09.2026, 18:00 МСК · Завершено</strong><p>Мой склад: 1 заказ · Заявка №001501</p><p>Пропущено заказов: 0</p><p class="form-error">Ошибка запуска</p></div></body></html>');
  await page.addStyleTag({path:path.resolve(__dirname,'../src/components/layout/la-panthera-theme.css')});
  await page.addStyleTag({content:'.auto-assembly-report{border:1px solid #e0e6ee;background:#f7f9fc;padding:14px;border-radius:10px;margin-top:12px;overflow-wrap:anywhere}'});
  const style = await page.locator('.auto-assembly-report').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth,fg:getComputedStyle(el.querySelector('strong')).color,text:getComputedStyle(el.querySelector('p')).color}));
  assert.equal(style.bg,'rgb(32, 33, 39)');
  assert.equal(style.border,'1px');
  assert.equal(style.fg,'rgb(222, 216, 238)');
  assert.equal(style.text,'rgb(201, 202, 214)');
  await page.evaluate(()=>document.documentElement.dataset.uiVariant='classic');
  assert.equal(await page.locator('.auto-assembly-report').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(247, 249, 252)');
  console.log('PASS: auto-assembly history graphite surface, readable labels, thin border and theme isolation');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
