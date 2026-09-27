import React, { useEffect, useMemo, useState } from 'react';
import { fetchClientRequests, fetchPickWaves, type AuthSession, type ClientRequestSummary, type PickWaveSummary } from '../../lib/api';
import { requestStatusLabel } from '../client-requests/clientRequestMeta';
import './wave-overview.css';

export type WaveRequest = ClientRequestSummary & { warehouseId?: string | null; warehouse?: { name: string } | null };
type Filters = { clientId?: string; warehouseId?: string; marketplace?: string; query?: string; dateFrom?: string; dateTo?: string };
// FIX: UI rollout only for our WMS; sold deployments retain their existing panel.
export function ourWaveOverviewEnabled(hostname: string) { return hostname === 'wms.logoff.pro'; }
function marketplace(r: WaveRequest) {
  const wb = /\bWB\b/i.test(r.title) || Boolean(r.wbSupplyIds?.length);
  const ozon = /\bOzon\b/i.test(r.title);
  return wb && ozon ? 'WB / Ozon' : wb ? 'WB' : ozon ? 'Ozon' : 'Не указан';
}
function quantity(r: { items: ClientRequestSummary['items'] }) { return r.items.reduce((n, i) => n + i.quantity, 0); }
function dateKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(date);
}
export function filterWaveRequests(rows: WaveRequest[], f: Filters) {
  const query = f.query?.trim().toLocaleLowerCase('ru') ?? '';
  return rows.filter(r => (!f.clientId || r.clientId === f.clientId)
    && (!f.warehouseId || r.warehouseId === f.warehouseId)
    && (!f.marketplace || marketplace(r).split(' / ').includes(f.marketplace))
    && (!f.dateFrom || dateKey(r.createdAt) >= f.dateFrom)
    && (!f.dateTo || dateKey(r.createdAt) <= f.dateTo)
    && (!query || [r.number, r.title, ...(r.wbSupplyIds ?? [])].join(' ').toLocaleLowerCase('ru').includes(query)));
}
const waveLabels: Record<string, string> = { PLANNED: 'План', BALANCE_REVIEW: 'Проверка балансов', FROZEN: 'План зафиксирован', PICKING: 'Сборка', DONE: 'Готово', FAILED: 'Ошибка', CANCELLED: 'Отменена' };

export function WaveOverviewPanel({ session }: { session: AuthSession }) {
  const [data, setData] = useState<{ requests: WaveRequest[]; waves: PickWaveSummary[] }>({ requests: [], waves: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    setData({ requests: [], waves: [] }); setUpdated(''); setLoading(true); setError('');
    // FIX: only existing GET endpoints, using the current session/branch scope.
    Promise.allSettled([fetchClientRequests(session.accessToken, { type: 'OUTBOUND' }), fetchPickWaves(session.accessToken)])
      .then(([requests, waves]) => {
        if (disposed) return;
        setData({ requests: requests.status === 'fulfilled' ? requests.value : [], waves: waves.status === 'fulfilled' ? waves.value : [] });
        const failures = [requests.status === 'rejected' ? 'Не удалось загрузить заявки.' : '', waves.status === 'rejected' ? 'Не удалось загрузить существующие волны.' : ''].filter(Boolean);
        setError(failures.join(' '));
        setUpdated(new Date().toLocaleTimeString('ru-RU'));
        setLoading(false);
      });
    return () => { disposed = true; };
  }, [session.accessToken, session.user.activeWarehouseId, revision]);
  return <WaveOverviewView {...data} loading={loading} error={error} updated={updated} onRefresh={() => setRevision(r => r + 1)} />;
}

export function WaveOverviewView({ requests, waves, loading = false, error = '', updated = '', onRefresh }: {
  requests: WaveRequest[]; waves: PickWaveSummary[]; loading?: boolean; error?: string; updated?: string; onRefresh?: () => void;
}) {
  const [tab, setTab] = useState<'requests' | 'waves'>('requests');
  const [filters, setFilters] = useState<Filters>({});
  const [selectedId, setSelectedId] = useState('');
  const fbs = useMemo(() => requests.filter(r => r.type === 'OUTBOUND' && ((r._count?.fbsOrderLinks ?? 0) > 0 || /\bFBS\b/i.test(r.title))), [requests]);
  const rows = filterWaveRequests(fbs, filters);
  const clients = [...new Map(fbs.map(r => [r.clientId, r.client.name])).entries()];
  const branches = [...new Map(fbs.filter(r => r.warehouseId).map(r => [r.warehouseId!, r.warehouse?.name ?? 'Филиал ' + r.warehouseId])).entries()];
  const activeRequest = rows.find(r => r.id === selectedId);
  const update = (key: keyof Filters, value: string) => { setFilters(f => ({ ...f, [key]: value })); setSelectedId(''); };
  return <section className="wave-overview" aria-label="Волны сборки — просмотр">
    <header className="wo-heading"><div><h2>Волны сборки</h2><p>Заявки и поставки в одном рабочем пространстве.</p></div><button type="button" onClick={onRefresh} disabled={loading || !onRefresh}>Обновить</button></header>
    <div className="wo-notice"><strong>Режим просмотра</strong><span>Создание и запуск волн пока отключены. ТСД, статусы заявок и остатки не изменяются.</span></div>
    {error && <p role="alert" className="wo-error">{error} Нажмите «Обновить», чтобы повторить.</p>}
    <div className="wo-tabs" role="tablist" aria-label="Раздел волн"><button role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}>Заявки FBS <span>{fbs.length}</span></button><button role="tab" aria-selected={tab === 'waves'} onClick={() => setTab('waves')}>Существующие волны <span>{waves.length}</span></button></div>
    {loading ? <p role="status">Загружаю данные…</p> : tab === 'requests' ? <>
      <div className="wo-filters"><label>Филиал<select value={filters.warehouseId ?? ''} onChange={e => update('warehouseId', e.target.value)}><option value="">Все доступные в текущем контексте</option>{branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Клиент<select value={filters.clientId ?? ''} onChange={e => update('clientId', e.target.value)}><option value="">Все клиенты</option>{clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Маркетплейс<select value={filters.marketplace ?? ''} onChange={e => update('marketplace', e.target.value)}><option value="">Все</option><option>WB</option><option>Ozon</option></select></label><label>Заявка или поставка<input type="search" value={filters.query ?? ''} onChange={e => update('query', e.target.value)} placeholder="Номер или название" /></label><label>Создана с (МСК)<input type="date" value={filters.dateFrom ?? ''} onChange={e => update('dateFrom', e.target.value)} /></label><label>Создана по (МСК)<input type="date" value={filters.dateTo ?? ''} onChange={e => update('dateTo', e.target.value)} /></label></div>
      <div className="wo-summary">Показано: {rows.length} · По заявкам: {rows.reduce((n, r) => n + quantity(r), 0)} ед. <span>Это список для просмотра, не подтверждение готовности к новой волне.</span></div>
      <div className="wo-scroll"><table><thead><tr><th>МП</th><th>Заявка / поставка</th><th>Единиц</th><th>Клиент / филиал</th><th>Дата</th><th>Сборка FBS</th><th>Статус</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><span className="wo-badge">{marketplace(r)}</span></td><td><button className="wo-link" onClick={() => setSelectedId(r.id)}>№{r.number}</button><small>{r.wbSupplyIds?.join(', ') || 'Поставка не указана в ответе API'}</small></td><td>{quantity(r)}</td><td>{r.client.name}<small>{r.warehouse?.name ?? 'Филиал не указан в ответе API'}</small></td><td>{dateKey(r.createdAt) || '—'}</td><td>{r.fbsCompletion ? `${r.fbsCompletion.completedOrders} из ${r.fbsCompletion.totalOrders} заказов` : 'Нет данных'}</td><td>{requestStatusLabel(r.status)}</td></tr>)}</tbody></table>{!rows.length && <p className="wo-empty">{error ? 'Список недоступен либо не соответствует фильтрам.' : 'Нет заявок по выбранным фильтрам.'}</p>}</div>
      <div className="wo-footer"><span>Проверка «только не начатые» будет подключена вместе с механизмом создания волн.</span><button disabled title="Будет доступно после подключения нового механизма волн">Создать волну</button></div>
      {activeRequest && <article className="wo-detail"><header><h3>Заявка №{activeRequest.number}</h3><button onClick={() => setSelectedId('')}>Закрыть</button></header><p>{activeRequest.title}</p><div className="wo-scroll"><table><thead><tr><th>Товар</th><th>Запрошено, ед.</th></tr></thead><tbody>{activeRequest.items.map((item, index) => <tr key={item.id ?? index}><td>{item.sku?.name ?? item.name ?? 'Без названия'}</td><td>{item.quantity}</td></tr>)}</tbody></table></div></article>}
    </> : <div className="wo-wave-list"><p>Исторические волны существующего механизма. Их статус не подтверждает физическую сборку через новый маршрут ТСД.</p>{waves.map(w => <article key={w.id} className="wo-detail"><header><h3>{w.waveNumber}</h3><span className="wo-badge">{waveLabels[w.status] ?? w.status}</span></header><p>Сборщик: {w.assignedPicker?.name ?? 'Не назначен'} · {w.requests.length} заявок · {dateKey(w.createdAt)}</p><details><summary>Состав и статусы заявок</summary><div className="wo-scroll"><table><thead><tr><th>Заявка</th><th>Клиент</th><th>Единиц по заявке</th><th>Состояние в волне</th></tr></thead><tbody>{w.requests.map(r => <tr key={r.requestId}><td>{r.request.title}</td><td>{r.request.client.name}</td><td>{quantity(r.request)}</td><td>{({ PENDING: 'Ожидает', PICKED: 'Обработана прежним механизмом', FAILED: 'Ошибка', SKIPPED: 'Пропущена' } as Record<string, string>)[r.status] ?? r.status}</td></tr>)}</tbody></table></div></details></article>)}{!waves.length && <p className="wo-empty">{error ? 'Данные волн недоступны либо список пуст.' : 'Существующих волн нет.'}</p>}<div className="wo-notice">Данные о товарах «не найдено» новый механизм ещё не передаёт. Отсутствие данных не означает отсутствие пропусков.</div></div>}
    <p className="wo-updated">{updated ? `Последняя загрузка: ${updated}. Обновление вручную.` : 'Доступ ограничен правами пользователя и выбранным филиалом.'}</p>
  </section>;
}
