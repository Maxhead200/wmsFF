import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// TEST: quick-access tiles must size to whole labels, including "Товарооборот".
test('Soul quick access keeps a word inside its tile', () => {
  const css = readFileSync(new URL('./soul-theme.css', import.meta.url), 'utf8');
  const rule = css.match(/\.soul-quick-items button\{([^}]*)\}/)?.[1];
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const overlay = readFileSync(new URL('../../../public/soul-quick-labels-20260930.css', import.meta.url), 'utf8');
  expect(rule).toBeTruthy();
  expect(html).toMatch(/href="\/soul-quick-labels-20260930\.css"/);
  expect(rule).toMatch(/(?:inline-size|width):max-content/);
  expect(rule).toMatch(/flex:0 0 auto/);
  expect(rule).toMatch(/max-width:100%/);
  expect(rule).toMatch(/overflow-wrap:normal/);
  expect(rule).not.toMatch(/overflow-wrap:anywhere|word-break:break-all/);
  for (const declaration of ['flex: 0 0 auto', 'width: max-content', 'min-width: 114px', 'max-width: 100%', 'overflow-wrap: normal', 'word-break: normal']) {
    expect(overlay).toContain(declaration);
  }
});
