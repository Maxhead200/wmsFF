import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WbStatusBadge, wbStatusLabel } from './WbStatusBadge';
// TEST: customer-facing WB translation, raw diagnostic code, and unknown status fallback.
describe('WB status badge', () => {
  it('shows sorted WB status instead of supplier complete', () => {
    expect(wbStatusLabel('complete/sorted')).toBe('Отсортировано');
    const html = renderToStaticMarkup(<WbStatusBadge status="complete/sorted" />);
    expect(html).toContain('Статус WB: Отсортировано');
    expect(html).toContain('title="complete/sorted"');
  });
  it('preserves cancellation and does not guess unknown statuses', () => {
    expect(wbStatusLabel('complete/canceled_by_client')).toBe('Отменён покупателем');
    expect(wbStatusLabel('complete/new_future_status')).toBe('Уточняется');
    expect(wbStatusLabel(null)).toBe('Не указан');
  });
});
