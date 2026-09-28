import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spiritChartOption } from '../analytics/spiritChartOption';

// TEST: Spirit is additive; chart values must remain exact, including zero/negative values.
describe('Spirit theme', () => {
  it('preserves chart amounts and ordering without synthetic minimums', () => {
    const rows = [{ name: 'Один', value: 0 }, { name: 'Два', value: -12.5 }, { name: 'Три', value: 100 }];
    const option = spiritChartOption(rows);
    expect(option.series[0].data).toEqual([0, -12.5, 100]);
    expect(option.yAxis.data).toEqual(rows.map(row => row.name));
    expect(option).not.toHaveProperty('dataZoom');
    expect(option).not.toHaveProperty('toolbox');
    expect(option.xAxis.splitLine.lineStyle.type).toBe('dashed');
    expect(option.series[0].itemStyle.color({ value: -12.5 })).toBe('#f69ba7');
    expect(option.series[0].itemStyle.color({ value: 100 })).toBe('#7de2c3');
  });
  it('adds an option without removing existing themes', () => {
    const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    for (const name of ['classic', 'modern', 'space', 'winx', 'spirit']) expect(app).toContain(`value: '${name}'`);
    expect(app).toContain("label: 'Spirit'");
  });
  it('scopes all styling to Spirit and keeps dense table cells', () => {
    const css = readFileSync(new URL('./spirit-theme.css', import.meta.url), 'utf8');
    expect(css).toContain("[data-ui-variant='spirit']");
    expect(css).toContain('padding: 7px 10px');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).not.toMatch(/!important/);
  });
});
