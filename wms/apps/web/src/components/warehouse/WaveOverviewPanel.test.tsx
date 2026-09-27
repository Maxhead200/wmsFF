import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WaveOverviewView, filterWaveRequests, ourWaveOverviewEnabled, type WaveRequest } from './WaveOverviewPanel';

// TEST: the new wave overview is read-only and never fabricates picking progress.
const rows = [
  { id: 'one', number: 901, type: 'OUTBOUND', status: 'IN_WORK', title: 'FBS WB', clientId: 'c1', client: { id: 'c1', name: 'Лукин' }, warehouseId: 'w1', warehouse: { name: 'Москва' }, createdAt: '2026-09-27T09:00:00Z', items: [{ quantity: 5 }], _count: { fbsOrderLinks: 3 }, wbSupplyIds: ['WB-GI-123'], fbsCompletion: { totalOrders: 3, completedOrders: 1 } },
  { id: 'two', number: 902, type: 'OUTBOUND', status: 'APPROVED', title: 'FBS Ozon', clientId: 'c2', client: { id: 'c2', name: 'Трофимова' }, warehouseId: 'w2', warehouse: { name: 'Ногинск' }, createdAt: '2026-09-26T09:00:00Z', items: [{ quantity: 2 }], _count: { fbsOrderLinks: 2 } },
] as unknown as WaveRequest[];
describe('read-only waves web overview', () => {
  it('renders actual request quantities and labels order progress honestly', () => {
    const html = renderToStaticMarkup(<WaveOverviewView requests={rows} waves={[]} />);
    expect(html).toContain('901'); expect(html).toContain('WB-GI-123');
    expect(html).toContain('1 из 3 заказов'); expect(html).toContain('Нет данных');
    expect(html).toContain('Создание и запуск волн пока отключены');
    expect(html).toContain('disabled');
  });
  it('filters by warehouse, client, marketplace, date and supply number', () => {
    expect(filterWaveRequests(rows, { clientId: 'c1', warehouseId: 'w1', marketplace: 'WB', query: 'GI-123', dateFrom: '2026-09-27', dateTo: '2026-09-27' }).map(r => r.id)).toEqual(['one']);
    expect(filterWaveRequests(rows, { clientId: 'c2', marketplace: 'WB' })).toEqual([]);
  });
  it('does not misclassify unknown marketplace or unknown branch', () => {
    const unknown = [{ ...rows[0], title: 'Отгрузка', wbSupplyIds: [], warehouseId: undefined }];
    expect(filterWaveRequests(unknown, { marketplace: 'WB' })).toEqual([]);
    expect(filterWaveRequests(unknown, { warehouseId: 'w1' })).toEqual([]);
  });
  it('enables only for our exact production hostname', () => {
    expect(ourWaveOverviewEnabled('wms.logoff.pro')).toBe(true);
    expect(ourWaveOverviewEnabled('sold.logoff.pro')).toBe(false);
    expect(ourWaveOverviewEnabled('wms.logoff.pro.evil.test')).toBe(false);
  });
  it('has no mutation API imports or calls', () => {
    const source = readFileSync(new URL('./WaveOverviewPanel.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/createPickWave|runPickWave|cancelPickWave|method:\s*['"](?:POST|PATCH|DELETE)/);
  });
});
