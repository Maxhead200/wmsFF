import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// TEST: guard the visible brand and browser tab icon together.
test('WMS brand uses Russian flag stripes and a red L on a white favicon', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  expect(html).toMatch(/href="\/brand-flag\.css"/);
  expect(html).toMatch(/rel="icon"[^>]*href="\/favicon\.svg"/);

  const css = readFileSync(new URL('../public/brand-flag.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.app-sidebar__brand\s*>\s*strong/);
  expect(css).toMatch(/#fff(?:fff)?/i);
  expect(css).toMatch(/#0039a6/i);
  expect(css).toMatch(/#d52b1e/i);
  expect(css).toMatch(/background-clip:\s*text/);

  const favicon = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
  expect(favicon).toMatch(/<rect[^>]*fill="#fff(?:fff)?"/i);
  expect(favicon).toMatch(/<path[^>]*fill="#d52b1e"/i);
});
