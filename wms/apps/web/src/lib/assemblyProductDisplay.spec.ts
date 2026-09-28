import { describe, expect, it } from 'vitest';
import { assemblyProductLabel, hasAssemblyProductDisplay } from './assemblyProductDisplay';

describe('assembly display', () => {
  // TEST: existing clients keep their exact labels, configured labels do not alter raw fields.
  it('keeps existing defaults and uses explicit server presentation', () => {
    expect(assemblyProductLabel({}, 'Старое отображение')).toBe('Старое отображение');
    const item = Object.freeze({ name: 'Название', barcode: '00123', productDisplayText: 'Артикул · M' });
    expect(assemblyProductLabel(item, item.name)).toBe('Артикул · M');
    expect(hasAssemblyProductDisplay(item)).toBe(true);
    expect(item.barcode).toBe('00123');
    expect(item.name).toBe('Название');
  });
});
