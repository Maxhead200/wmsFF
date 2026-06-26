import type { LogisticsDeliveryStatus } from '../../lib/api';

export const logisticsDeliveryStatusOptions: Array<{ value: LogisticsDeliveryStatus; label: string }> = [
  { value: 'REQUESTED', label: 'Запрошена' },
  { value: 'QUOTED', label: 'Рассчитана' },
  { value: 'PLANNED', label: 'Запланирована' },
  { value: 'IN_TRANSIT', label: 'В пути' },
  { value: 'DELIVERED', label: 'Доставлена' },
  { value: 'CANCELLED', label: 'Отменена' },
];

export function logisticsDeliveryStatusLabel(value: LogisticsDeliveryStatus) {
  return logisticsDeliveryStatusOptions.find((option) => option.value === value)?.label ?? value;
}

export function logisticsDeliveryStatusTone(status: LogisticsDeliveryStatus) {
  if (status === 'DELIVERED' || status === 'QUOTED') {
    return 'ready';
  }

  if (status === 'PLANNED' || status === 'IN_TRANSIT') {
    return 'in-progress';
  }

  return 'planned';
}
