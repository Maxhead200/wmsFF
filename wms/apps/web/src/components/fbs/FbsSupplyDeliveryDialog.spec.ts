import { describe, expect, it } from 'vitest';
import { canSubmitFbsSupplyDelivery } from './FbsPanel';

describe('FBS supply delivery confirmation', () => {
  it('enables delivery only for the WB-required office and a selected date', () => {
    // TEST: the UI must not enable an irreversible request for another office.
    const options = { requiredDestinationOfficeId: '123', blockers: [] };

    expect(canSubmitFbsSupplyDelivery(options, '456', '2026-09-02')).toBe(false);
    expect(canSubmitFbsSupplyDelivery(options, '123', '')).toBe(false);
    expect(canSubmitFbsSupplyDelivery(options, '123', '2026-09-02')).toBe(true);
  });

  it('keeps delivery blocked while WB reports a route conflict', () => {
    expect(
      canSubmitFbsSupplyDelivery(
        { requiredDestinationOfficeId: '123', blockers: ['Поставки относятся к разным складам.'] },
        '123',
        '2026-09-02',
      ),
    ).toBe(false);
  });
});
