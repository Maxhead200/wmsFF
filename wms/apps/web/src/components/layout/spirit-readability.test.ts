import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync(new URL('./spirit-theme.css', import.meta.url), 'utf8');
const color = (name: string) => css.match(new RegExp(`--${name}: (#[a-fA-F0-9]{6})`))![1];
const luminance = (hex: string) => {
  const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};
// TEST: reproduces pale labels on light controls; verify every principal text/background pair.
describe('Spirit warm readable palette', () => {
  it('uses light native controls and accessible text contrast', () => {
    expect(css).toContain('color-scheme: light');
    for (const fg of ['ink', 'muted', 'ok', 'danger']) {
      for (const bg of ['surface', 'bg']) {
        const values = [luminance(color(fg)), luminance(color(bg))].sort((a,b)=>b-a);
        expect((values[0]+.05)/(values[1]+.05), `${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(css).toContain('.client-request-action-button span');
    expect(css).toContain('color: inherit');
  });
  it('lifts tiles only for precise hover and respects reduced motion', () => {
    expect(css).toContain('@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    expect(css).toContain('transform: translateY(-3px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)');
    expect(css).not.toMatch(/tr:hover[^}]*transform:/);
  });
});
