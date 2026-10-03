import { createHash } from 'node:crypto';
import { parseBillingPeriod, record, type PeriodCharge, type PeriodInvoice, type PeriodPreviewLine } from './billing-period-policy';

export type DoneRequest = { id: string; number: number; clientId: string; warehouseId: string | null; status: string;
  client: PeriodCharge['client']; updatedAt: Date; events: Array<{ id: string; createdAt: Date }> };
export type DoneCharge = PeriodCharge & { requestId: string | null };
export type DoneInvoice = PeriodInvoice & { requestId: string | null };
type Input = { periodFrom: string; periodTo: string; clientId?: string };

// FIX: request events are instants; surrender calendar dates use the warehouse's Moscow timezone.
export function doneRequestDates(input: Input) {
  parseBillingPeriod(input.periodFrom, input.periodTo);
  return { from: new Date(`${input.periodFrom}T00:00:00+03:00`), to: new Date(`${input.periodTo}T23:59:59.999+03:00`) };
}
export function buildDoneRequestsPlan(input: Input, requests: DoneRequest[], charges: DoneCharge[], invoices: DoneInvoice[], warehouseId: string) {
  const { from, to } = doneRequestDates(input);
  const issues: Array<{ id: string; clientName: string; message: string }> = [];
  const issue = (id: string, clientName: string, message: string) => issues.push({ id, clientName, message });
  const selected = requests.filter(r => {
    if (r.status !== 'DONE' || r.warehouseId !== warehouseId || (input.clientId && r.clientId !== input.clientId)) return false;
    const event = [...r.events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
    if (!event) { issue(r.id, r.client.name, `Заявка №${r.number}: дата сдачи не найдена в истории. Требуется проверка.`); return false; }
    return event.createdAt >= from && event.createdAt <= to;
  }).sort((a, b) => a.id.localeCompare(b.id));
  const requestMap = new Map(selected.map(r => [r.id, r]));
  const eligibleCharges = charges.filter(c => c.requestId && requestMap.get(c.requestId)?.clientId === c.clientId && c.status !== 'CANCELLED');
  const chargeMap = new Map(eligibleCharges.map(c => [c.id, c]));
  type Group = { key: string; clientId: string; clientName: string; warehouseId: string; category: 'OTHER'; chargeIds: string[];
    invoiceIds: string[]; requestIds: string[]; totalRub: number; itemCount: number; action: 'CREATE' | 'EXISTING'; existingInvoiceId?: string; lines: PeriodPreviewLine[] };
  const groups = new Map<string, Group>();
  const add = (client: PeriodCharge['client'], id: string, lines: PeriodPreviewLine[], requestIds: string[], isInvoice = false) => {
    const g = groups.get(client.id) ?? { key: `${client.id}:${warehouseId}:DONE_REQUESTS`, clientId: client.id,
      clientName: client.name, warehouseId, category: 'OTHER', chargeIds: [], invoiceIds: [], requestIds: [], totalRub: 0, itemCount: 0, action: 'CREATE', lines: [] };
    g[isInvoice ? 'invoiceIds' : 'chargeIds'].push(id); g.lines.push(...lines); g.itemCount += lines.length;
    g.requestIds = [...new Set([...g.requestIds, ...requestIds])].sort();
    g.totalRub = Math.round((g.totalRub + lines.reduce((sum, l) => sum + Number(l.totalRub), 0)) * 100) / 100;
    groups.set(client.id, g);
  };
  const valid = (row: { quantity: unknown; unitPriceRub: unknown; totalRub: unknown; metadata?: unknown }) =>
    Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0 && Number.isFinite(Number(row.unitPriceRub)) &&
    Number(row.unitPriceRub) > 0 && Number.isFinite(Number(row.totalRub)) && Number(row.totalRub) > 0 &&
    record(row.metadata).priceRequiresConfirmation !== true;
  const line = (row: { description: string; serviceDate: Date; unit: string; quantity: { toString(): string }; unitPriceRub: { toString(): string }; totalRub: { toString(): string } }) => ({
    description: row.description, serviceDate: row.serviceDate.toISOString().slice(0, 10), unit: row.unit,
    quantity: row.quantity.toString(), unitPriceRub: row.unitPriceRub.toString(), totalRub: row.totalRub.toString(),
  });
  for (const r of selected) {
    if (!eligibleCharges.some(c => c.requestId === r.id) && !invoices.some(i => i.requestId === r.id && i.status !== 'CANCELLED'))
      issue(r.id, r.client.name, `Заявка №${r.number}: нет начислений или сохранённого расчёта. Нужна проверка выполненных услуг и тарифов.`);
  }
  for (const c of eligibleCharges) {
    if (c.invoiceItems.some(link => link.invoice.status !== 'CANCELLED')) continue;
    if (c.status !== 'APPROVED' || !valid(c)) {
      issue(c.id, c.client.name, `Заявка №${requestMap.get(c.requestId!)!.number}: проверьте утверждение и тариф услуги «${c.description}».`); continue;
    }
    add(c.client, c.id, [{ ...line(c), sourceType: 'CHARGE', sourceId: c.id, chargeId: c.id }], [c.requestId!]);
  }
  let alreadyBilledCount = 0;
  const sourceCounts = new Map<string, number>();
  for (const i of invoices.filter(i => i.status !== 'CANCELLED')) for (const row of i.items)
    if (row.chargeId) sourceCounts.set(row.chargeId, (sourceCounts.get(row.chargeId) ?? 0) + 1);
  for (const i of invoices) {
    if (i.status === 'CANCELLED') continue;
    const requestOwned = i.requestId && requestMap.get(i.requestId)?.clientId === i.clientId;
    const touches = requestOwned || i.items.some(row => row.chargeId && chargeMap.has(row.chargeId));
    if (!touches) continue;
    if (i.status !== 'DRAFT' || Number(i.paidRub) !== 0 || i.payments.length) { alreadyBilledCount++; continue; }
    const owned = i.items.length && i.items.every(row => row.chargeId ? chargeMap.get(row.chargeId)?.clientId === i.clientId : requestOwned);
    const branch = i.warehouseId ?? i.request?.warehouseId;
    if (!owned || branch !== warehouseId || i.items.some(row => row.chargeId && (sourceCounts.get(row.chargeId) ?? 0) > 1)) {
      issue(i.id, i.client.name, `Счёт ${i.number}: смешанные заявки, другой филиал или повторяющийся источник. Автоматическое разделение запрещено.`); continue;
    }
    const rowTotal = Math.round(i.items.reduce((n, row) => n + Number(row.totalRub), 0) * 100) / 100;
    if (i.items.some(row => !valid({ ...row, metadata: row.chargeId ? chargeMap.get(row.chargeId)?.metadata : undefined })) ||
      !Number.isFinite(Number(i.totalRub)) || Math.abs(rowTotal - Number(i.totalRub)) > .005) {
      issue(i.id, i.client.name, `Счёт ${i.number}: требуется проверка строк, суммы или тарифа.`); continue;
    }
    add(i.client, i.id, i.items.map(row => ({ ...line(row), sourceType: 'INVOICE', sourceId: i.id, sourceNumber: i.number,
      invoiceItemId: row.id, chargeId: row.chargeId ?? undefined })),
      [...new Set(i.items.map(row => row.chargeId ? chargeMap.get(row.chargeId)!.requestId! : i.requestId!))], true);
  }
  const result = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const g of result) {
    g.chargeIds.sort(); g.invoiceIds.sort(); g.lines.sort((a, b) => `${a.sourceId}:${a.invoiceItemId ?? ''}`.localeCompare(`${b.sourceId}:${b.invoiceItemId ?? ''}`));
    const i = !g.chargeIds.length && g.invoiceIds.length === 1 ? invoices.find(i => i.id === g.invoiceIds[0]) : undefined;
    if (i && i.periodFrom.toISOString().slice(0, 10) === input.periodFrom && i.periodTo.toISOString().slice(0, 10) === input.periodTo) {
      g.action = 'EXISTING'; g.existingInvoiceId = i.id;
    }
  }
  return { periodFrom: input.periodFrom, periodTo: input.periodTo, groups: result, issues, alreadyBilledCount, zeroCount: 0,
    requests: selected.map(r => ({ id: r.id, number: r.number, clientName: r.client.name,
      surrenderedAt: [...r.events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].createdAt.toISOString() })),
    previewHash: createHash('sha256').update(JSON.stringify({ input, warehouseId, requests, charges, invoices, groups: result, issues })).digest('hex') };
}
