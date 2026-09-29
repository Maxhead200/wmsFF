// FIX: translate the WB portion of supplier/WB status pairs without changing shipment decisions.
const labels: Record<string, string> = {
  sorted: 'Отсортировано', waiting: 'Ожидает передачи', sold: 'Получен покупателем',
  canceled: 'Отменён', canceled_by_client: 'Отменён покупателем', declined_by_client: 'Отменён покупателем',
  defect: 'Отмена из-за брака', ready_for_pickup: 'Готов к получению', postponed_delivery: 'Доставка перенесена',
  accepted_by_carrier: 'Принят перевозчиком', sent_to_carrier: 'Передан перевозчику', canceled_by_carrier: 'Отменён перевозчиком',
  new: 'Новый', confirm: 'На сборке', complete: 'Передан в доставку', cancel: 'Отменён продавцом', cancel_carrier: 'Отменён перевозчиком',
};
export function wbStatusLabel(status?: string | null) {
  const parts = (status || '').split('/').map(part => part.trim().toLowerCase());
  const code = parts.length > 1 ? parts[1] : parts[0];
  return labels[code] || (code ? 'Уточняется' : 'Не указан');
}
export function WbStatusBadge({ status }: { status?: string | null }) {
  return <span className="wb-status-badge" title={status || undefined}>Статус WB: {wbStatusLabel(status)}</span>;
}
