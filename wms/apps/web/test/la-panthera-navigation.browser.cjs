const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('C:/Users/La_pa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// TEST: actual sidebar selectors, graphite cyan underlay, selected spectrum and motion isolation.
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<html data-ui-theme="modern" data-ui-variant="la_panthera"><body><aside class="app-sidebar"><nav class="workspace-nav"><button class="active"><svg></svg><span>Склад</span></button><button id="other"><svg></svg><span>FBS</span></button></nav></aside><header class="workspace-header">Меню</header></body></html>`);
    await page.addStyleTag({ path: path.resolve(__dirname, '../src/components/layout/la-panthera-theme.css') });
    // TEST: reduce only the action background intensity, keeping foreground opaque.
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend','<div class="client-request-actions"><button class="client-request-action-button"><span>Выбрать короба</span></button></div>');
      document.querySelector('#other').insertAdjacentHTML('beforeend','<strong class="workspace-nav__badge">99+</strong>');
    });
    const css = (selector, property) => page.locator(selector).evaluate((el, prop) => getComputedStyle(el)[prop], property);
    assert.match(await css('.client-request-action-button', 'backgroundImage'), /rgba\(106, 90, 205, 0.3\)/);
    assert.equal(await css('.client-request-action-button', 'opacity'), '1');
    assert.equal(await css('.workspace-nav__badge', 'backgroundColor'), 'rgb(32, 49, 53)');
    assert.equal(await css('.workspace-nav__badge', 'color'), 'rgb(184, 231, 231)');
    for (const selector of ['.app-sidebar', '.workspace-header']) {
      assert.match(await css(selector, 'backgroundImage'), /51, 255, 255/);
      assert.equal(await css(selector, 'backgroundColor'), 'rgb(20, 21, 25)');
    }
    assert.equal(await css('.active svg', 'color'), 'rgb(193, 84, 193)');
    assert.equal(await css('.active span', 'color'), 'rgb(222, 216, 238)');
    assert.equal(await css('.active', 'animationName'), 'panthera-navigation-spectrum');
    await page.locator('#other').hover();
    assert.match(await css('#other', 'backgroundImage'), /248, 0, 0/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await css('.active', 'animationName'), 'none');
    assert.equal(await css('#other', 'transform'), 'none');
    await page.evaluate(() => document.documentElement.dataset.uiVariant = 'classic');
    assert.equal(await css('.active', 'animationName'), 'none');
    assert.equal(await css('.workspace-header', 'backgroundImage'), 'none');
    await page.evaluate(() => document.documentElement.dataset.uiVariant = 'la_panthera');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await css('.workspace-header', 'backgroundImage'), 'none');
    console.log('PASS: sidebar and header cyan underlay, spectrum, hover, reduced motion, theme and print isolation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
