import type { BillingChargeStatus, BillingUnit } from '../../lib/api';

export const billingUnitOptions: Array<{ value: BillingUnit; label: string }> = [
  { value: 'SERVICE', label: 'Услуга' },
  { value: 'PIECE', label: 'Штука' },
  { value: 'BOX', label: 'Короб' },
  { value: 'PALLET', label: 'Паллет' },
  { value: 'LITER', label: 'Литр' },
  { value: 'DAY', label: 'День' },
  { value: 'HOUR', label: 'Час' },
];

export const billingStatusOptions: Array<{ value: BillingChargeStatus; label: string }> = [
  { value: 'DRAFT', label: 'Черновик' },
  { value: 'APPROVED', label: 'Утверждено' },
  { value: 'CANCELLED', label: 'Отменено' },
];

export function billingUnitLabel(value: BillingUnit) {
  return billingUnitOptions.find((option) => option.value === value)?.label ?? value;
}

export function billingStatusLabel(value: BillingChargeStatus) {
  return billingStatusOptions.find((option) => option.value === value)?.label ?? value;
}

export function billingStatusTone(value: BillingChargeStatus) {
  if (value === 'APPROVED') {
    return 'ready';
  }

  if (value === 'CANCELLED') {
    return 'planned';
  }

  return 'in-progress';
}
