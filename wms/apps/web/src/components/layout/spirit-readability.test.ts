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
  // TEST: principal reading text remains high-contrast on both canvas and cards.
  it('keeps primary and secondary reading text above 7:1', () => {
    for (const fg of ['ink', 'muted']) for (const bg of ['surface', 'bg']) {
      const values = [luminance(color(fg)), luminance(color(bg))].sort((a,b)=>b-a);
      expect((values[0]+.05)/(values[1]+.05), `${fg}/${bg}`).toBeGreaterThanOrEqual(7);
    }
  });
  it('lifts tiles only for precise hover and respects reduced motion', () => {
    expect(css).toContain('@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    // TEST: depth varies with pointer, with no fixed upward screen translation.
    expect(css).toContain('transform: perspective(700px) translateZ(var(--spirit-tilt-z, 0px)) rotateX(var(--spirit-tilt-x, 0deg)) rotateY(var(--spirit-tilt-y, 0deg))');
    expect(css).not.toMatch(/transform:\s*translate/);
    expect(css).toContain('@media (prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)');
    expect(css).not.toMatch(/tr:hover[^}]*transform:/);
  });
  // TEST: resting tiles must have visible depth, not just a transient hover shadow.
  it('gives tiles resting elevation and a pressed state without resizing', () => {
    expect(css).toContain('--spirit-tile-shadow:');
    expect(css).toContain('box-shadow: var(--spirit-tile-shadow)');
    expect(css).toContain('inset 0 1px 0 rgb(255 255 255 / 0.95)');
    expect(css).toContain('linear-gradient(160deg, #ffffff 0%, #fff5eb 45%, #ffdfbd 100%)');
    expect(css).toContain(':active:not(:disabled) { transform: none');
    expect(css).not.toContain('scale(1.');
  });
  // TEST: orange gradient endpoints retain readable labels, including at their darkest end.
  it('uses a white-to-orange canvas with readable gradient endpoints', () => {
    expect(css).toContain('--spirit-canvas: linear-gradient(135deg, #ffffff 0%, #fff5eb 42%, #ffe3c7 100%)');
    expect(css).toContain('background: var(--spirit-canvas)');
    for (const fg of ['ink', 'muted']) for (const bg of ['#ffffff', '#fff5eb', '#ffe3c7', '#ffdfbd']) {
      expect((luminance(bg) + .05) / (luminance(color(fg)) + .05)).toBeGreaterThanOrEqual(7);
    }
  });
});
